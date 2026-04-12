// ═══════════════════════════════════════════════════════════════════════════════
// Orchestrator Graph v2 — Multi-agent LangGraph state machine
// Replaces the flat generate_file loop with adaptive routing between agents.
// ═══════════════════════════════════════════════════════════════════════════════

import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import config from '../../config.js';
import logger from '../../services/logger.js';
import { ProjectMemory } from '../shared/memory.js';
import { AgentEventEmitter } from '../shared/events.js';
import { PlannerAgent } from '../planner/agent.js';
import { CoderAgent } from '../coder/agent.js';
import { ReviewerAgent } from '../reviewer/agent.js';
import { FixerAgent } from '../fixer/agent.js';
import { createInitialState, assessQuality, PHASES } from './state.js';
import {
    routeAfterPlanValidation,
    routeAfterGenerate,
    routeAfterReview,
    routeAfterFix,
} from './router.js';
import { validateImportResolution, auditPackageDependencies } from '../../services/importResolver.js';

// ─── State Schema (Annotation.Root) ─────────────────────────────────────────

const OrchestratorState = Annotation.Root({
    // Identity
    generationId: Annotation(),
    userPrompt: Annotation(),
    sessionId: Annotation(),
    projectDir: Annotation(),

    // Plan
    plan: Annotation(),
    planRevisions: Annotation(),
    planValidation: Annotation(),

    // Requirements
    requirements: Annotation(),

    // Shared memory & event emitter (injected via configurable)
    memory: Annotation(),
    emitter: Annotation(),

    // Generation tracking
    phase: Annotation(),
    fileQueue: Annotation(),
    currentFileIndex: Annotation(),

    // Error budget
    errorBudget: Annotation(),

    // Review & fix
    reviewResult: Annotation(),
    fixRounds: Annotation(),

    // Metrics (accumulated via reducer)
    metrics: Annotation({
        reducer: (left, right) => {
            if (!left || !right) return right || left || {};
            return {
                ...left,
                ...right,
                llmCalls: (left.llmCalls || 0) + (right.llmCalls || 0),
                fixAttempts: (left.fixAttempts || 0) + (right.fixAttempts || 0),
            };
        },
        default: () => ({ startTime: Date.now(), llmCalls: 0, fixAttempts: 0, filesGenerated: 0, filesFixed: 0, filesFailed: 0 }),
    }),

    // Control
    stepCount: Annotation(),
    maxSteps: Annotation(),

    // Backward compat: generatedFiles accumulator
    generatedFiles: Annotation({
        reducer: (left, right) => (left && right ? { ...left, ...right } : right || left || {}),
        default: () => ({}),
    }),
});

// ─── Graph Builder ───────────────────────────────────────────────────────────

let _compiledGraphV2 = null;
let _compiledGraphServices = null;

/**
 * Build and compile the v2 orchestrator graph.
 * Agents are instantiated with services; state is shared via LangGraph channels.
 * Re-compiles if services change (supports testing with different service instances).
 */
function buildGraphV2(services) {
    if (_compiledGraphV2 && _compiledGraphServices === services) return _compiledGraphV2;

    const planner = new PlannerAgent(services);
    const coder = new CoderAgent(services);
    const reviewer = new ReviewerAgent(services);
    const fixer = new FixerAgent(services);

    // ── Node functions ───────────────────────────────────────────────────────

    async function planNode(state) {
        const delta = await planner.createPlan(state);
        return { ...delta, stepCount: (state.stepCount || 0) + 1 };
    }

    async function validatePlanNode(state) {
        const delta = await planner.validatePlan(state);
        return { ...delta, stepCount: (state.stepCount || 0) + 1, phase: PHASES.PLAN_VALIDATION };
    }

    async function revisePlanNode(state) {
        const delta = await planner.revisePlan(state);
        return { ...delta, stepCount: (state.stepCount || 0) + 1 };
    }

    function emitPlanNode(state) {
        const { plan, requirements, memory, emitter } = state;
        const files = plan?.files || [];
        const framework = requirements?.framework || config.defaultFramework;

        // Plan files are already sorted by dependency in validatePlan (see validators.js)
        const sortedFiles = files.length > 0 ? files : sortFilesForGeneration(files, framework);

        // Emit plan to frontend
        emitter?.emitPlan({
            files: files.map(f => ({ path: f.path, purpose: f.purpose })),
            techStack: plan?.techStack || [],
            framework,
            stylingFramework: requirements?.stylingFramework || 'plain-css',
        });
        emitter?.emitProgress('Starting generation...', 0);

        return {
            phase: PHASES.GENERATING,
            fileQueue: sortedFiles,
            currentFileIndex: 0,
            stepCount: (state.stepCount || 0) + 1,
        };
    }

    async function generateNextFileNode(state, runConfig) {
        const injectedServices = runConfig?.configurable?.services;
        const coderAgent = injectedServices ? new CoderAgent(injectedServices) : coder;
        const delta = await coderAgent.generateNext(state);
        return { ...delta, stepCount: (state.stepCount || 0) + 1 };
    }

    async function reviewNode(state) {
        const delta = await reviewer.reviewProject(state);
        const { emitter } = state;
        emitter?.emitProgress('Reviewing project...', 92);
        return { ...delta, stepCount: (state.stepCount || 0) + 1, phase: PHASES.REVIEWING };
    }

    async function fixNode(state) {
        const { emitter } = state;
        emitter?.emitProgress('Fixing issues...', 94);
        const delta = await fixer.fixIssues(state);
        return { ...delta, stepCount: (state.stepCount || 0) + 1, phase: PHASES.FIXING };
    }

    async function finalizeNode(state, runConfig) {
        const services = runConfig?.configurable?.services;
        const agentFixer = services?.agentFixer;
        const { memory, emitter, metrics, requirements, userPrompt } = state;

        const KNOWN_VERSIONS = {
            axios: '^1.6.0',
            dayjs: '^1.11.0',
            'date-fns': '^3.0.0',
            lodash: '^4.17.21',
            zustand: '^4.4.0',
            'react-router-dom': '^6.20.0',
            'react-query': '^3.39.3',
            '@tanstack/react-query': '^5.0.0',
            'framer-motion': '^10.0.0',
            clsx: '^2.0.0',
            classnames: '^2.3.2',
            zod: '^3.22.0',
            'react-hook-form': '^7.48.0',
            'react-hot-toast': '^2.4.0',
        };

        let files = { ...(memory?.getGeneratedFiles() || {}) };
        let validationResult = {
            initialIssues: 0,
            remainingIssues: 0,
            missingPackages: [],
            repaired: true,
        };

        if (Object.keys(files).length > 0) {
            let importIssues = validateImportResolution(files);
            let { missing: missingPackages } = auditPackageDependencies(files);

            validationResult.initialIssues = importIssues.length;
            validationResult.missingPackages = [...missingPackages];

            if (missingPackages.length > 0 && files['package.json']) {
                try {
                    const pkg = JSON.parse(files['package.json']);
                    pkg.dependencies = pkg.dependencies || {};
                    for (const pkgName of missingPackages) {
                        pkg.dependencies[pkgName] = KNOWN_VERSIONS[pkgName] || '^1.0.0';
                        logger.info('Auto-added missing package dependency', { package: pkgName });
                    }
                    const updated = JSON.stringify(pkg, null, 2);
                    files['package.json'] = updated;
                    memory?.setFileFixed('package.json', updated, { isValid: true, errors: [], warnings: [] });
                    ({ missing: missingPackages } = auditPackageDependencies(files));
                    validationResult.missingPackages = [...missingPackages];
                } catch (err) {
                    logger.warn('Could not patch package.json for missing packages', { error: err.message });
                }
            }

            if (importIssues.length > 0 && agentFixer) {
                const repair = await agentFixer.fixProjectInOrder(
                    files,
                    { importIssues },
                    memory,
                    requirements?.framework || config.defaultFramework,
                    userPrompt,
                    (msg) => logger.info(msg)
                );
                files = repair.files;
                validationResult.remainingIssues = repair.remainingIssues.length;
                validationResult.repaired = repair.remainingIssues.length === 0;
            } else {
                validationResult.remainingIssues = importIssues.length;
                validationResult.repaired = importIssues.length === 0;
            }
        }

        const quality = assessQuality(memory);
        const counts = memory?.getStatusCounts() || {};

        const finalMetrics = {
            ...metrics,
            filesGenerated: counts.generated + counts.fixed,
            filesFixed: counts.fixed,
            filesFailed: counts.failed,
            duration: (Date.now() - (metrics?.startTime || Date.now())) / 1000,
            quality,
            validationResult,
        };

        emitter?.emitProgress('Finalizing...', 98);

        logger.info(`[Orchestrator] Finalized — quality: ${quality}`, finalMetrics);

        return {
            phase: PHASES.DONE,
            metrics: finalMetrics,
            generatedFiles: files,
        };
    }

    // ── Build graph ──────────────────────────────────────────────────────────

    const builder = new StateGraph(OrchestratorState)
        .addNode('create_plan', planNode)
        .addNode('validate_plan', validatePlanNode)
        .addNode('revise_plan', revisePlanNode)
        .addNode('emit_plan', emitPlanNode)
        .addNode('generate_next_file', generateNextFileNode)
        .addNode('review', reviewNode)
        .addNode('fix', fixNode)
        .addNode('finalize', finalizeNode)

        // Edges
        .addEdge(START, 'create_plan')
        .addEdge('create_plan', 'validate_plan')

        .addConditionalEdges('validate_plan', routeAfterPlanValidation, [
            'emit_plan',
            'revise_plan',
        ])
        .addEdge('revise_plan', 'validate_plan')

        .addEdge('emit_plan', 'generate_next_file')

        .addConditionalEdges('generate_next_file', routeAfterGenerate, [
            'generate_next_file',
            'review',
        ])

        .addConditionalEdges('review', routeAfterReview, [
            'finalize',
            'fix',
            'revise_plan',
        ])

        .addConditionalEdges('fix', routeAfterFix, [
            'review',
        ])

        .addEdge('finalize', END);

    _compiledGraphV2 = builder.compile();
    _compiledGraphServices = services;
    return _compiledGraphV2;
}

// ─── File Sorting ────────────────────────────────────────────────────────────

/**
 * Sort files for generation — configs first, then entry points, then components.
 */
function sortFilesForGeneration(files, framework) {
    const priority = (f) => {
        const p = f.path || f;
        if (p === 'package.json') return 0;
        if (p.includes('tsconfig')) return 1;
        if (p.includes('config')) return 2;
        if (p.endsWith('.css') || p.endsWith('.scss')) return 3;
        if (p.includes('layout')) return 4;
        if (p.includes('App.') || p.includes('page.') || p === 'index.html') return 5;
        if (p.includes('main.') || p.includes('index.')) return 6;
        return 7;
    };

    return [...files].sort((a, b) => priority(a) - priority(b));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run the v2 generation pipeline.
 *
 * @param {object} services - { analysisService, generationService, validator, agentFixer }
 * @param {object} params - { generationId, userPrompt, requirements, plan, projectDir, callbacks }
 * @returns {Promise<{ success, projectId, duration, filesGenerated, quality, error, stepsUsed }>}
 */
export async function runGenerationGraphV2(services, params) {
    const startTime = Date.now();
    const { generationId, userPrompt, requirements, plan, projectDir, callbacks } = params;

    const files = plan?.files || [];
    if (files.length === 0) {
        return { success: false, error: 'No files in plan', duration: 0, stepsUsed: 0 };
    }

    // Create shared memory and event emitter
    const memory = new ProjectMemory();
    const emitter = new AgentEventEmitter(callbacks || {});

    const initialState = createInitialState({
        generationId,
        userPrompt,
        sessionId: params.sessionId,
        requirements,
        plan,
        memory,
        emitter,
        projectDir,
    });

    const graph = buildGraphV2(services);

    // Compute recursion limit: each file = 1 step + overhead for plan/validate/emit/review/fix
    // Pad generously: the planner may generate MORE files than the original plan,
    // and fix cycles add review→fix→review loops (each ~2-3 steps per round)
    const fileCount = files.length;
    const recursionLimit = Math.max(75, fileCount * 4 + 30);

    let finalState;
    try {
        finalState = await graph.invoke(initialState, {
            configurable: { services },
            recursionLimit,
        });
    } catch (err) {
        logger.error(`[Orchestrator v2] Error: ${err.message}`, { generationId });
        return {
            success: false,
            error: err.message,
            duration: (Date.now() - startTime) / 1000,
            stepsUsed: 0,
            quality: 'failed',
        };
    }

    const duration = (Date.now() - startTime) / 1000;
    const quality = finalState.metrics?.quality || assessQuality(memory);
    const filesGenerated = Object.keys(finalState.generatedFiles || {}).length;
    const success = finalState.phase === PHASES.DONE && filesGenerated > 0;
    const projectId = projectDir ? projectDir.split(/[/\\]/).pop() : null;

    logger.info(`[Orchestrator v2] Complete — ${quality}, ${filesGenerated} files, ${duration}s, ${finalState.stepCount} steps`, { generationId });

    return {
        success,
        projectId,
        duration,
        filesGenerated,
        quality,
        partialSuccess: !success && filesGenerated > 0,
        error: success ? undefined : 'Generation completed with issues',
        stepsUsed: finalState.stepCount || 0,
        metrics: finalState.metrics,
        validationResult: finalState.metrics?.validationResult,
    };
}

/**
 * Reset the cached compiled graph (for testing).
 */
export function resetGraphV2() {
    _compiledGraphV2 = null;
    _compiledGraphServices = null;
}

export { OrchestratorState, buildGraphV2 };
