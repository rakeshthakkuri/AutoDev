// ═══════════════════════════════════════════════════════════════════════════════
// Generation Orchestrator — LangGraph state graph
// Replaces the custom while-loop orchestrator with a LangGraph StateGraph.
// ═══════════════════════════════════════════════════════════════════════════════

import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import config from '../config.js';
import logger from '../services/logger.js';
import { createGenerationTools } from './tools.js';

const PHASE_SEQUENTIAL = 'sequential';
const PHASE_CONCURRENT = 'concurrent';
const PHASE_REVIEW = 'review';
const PHASE_DONE = 'done';

// ─── State schema (Annotation.Root: last-value unless reducer specified) ─────
const GenerationState = Annotation.Root({
    generationId: Annotation(),
    plan: Annotation(),
    requirements: Annotation(),
    userPrompt: Annotation(),
    projectDir: Annotation(),
    generatedFiles: Annotation({
        reducer: (left, right) => (left && right ? { ...left, ...right } : right || left || {}),
        default: () => ({}),
    }),
    sortedFiles: Annotation(),
    sequential: Annotation(),
    concurrent: Annotation(),
    phase: Annotation(),
    sequentialIndex: Annotation(),
    concurrentIndex: Annotation(),
    filesCompleted: Annotation(),
    structureWarnings: Annotation(),
    reviewValidated: Annotation(),
    stepCount: Annotation(),
    lastError: Annotation(),
});

// Compiled graph is cached after first build — service-specific tool execution
// is injected through LangGraph's `configurable`, not the graph structure itself.
let _compiledGraph = null;

/**
 * Build and compile the generation StateGraph (compiled once and cached).
 * Service/callbacks are passed via configurable at invoke time, not at build time.
 *
 * @param {import('../services/projectGeneration.js').ProjectGenerationService} service
 * @returns {import('@langchain/langgraph').CompiledStateGraph}
 */
function buildGraph(service) {
    if (_compiledGraph) return _compiledGraph;
    const tools = createGenerationTools(service);

    function emitPlan(state, runConfig) {
        const callbacks = runConfig?.configurable?.callbacks;
        const { plan, requirements } = state;
        const files = plan?.files || [];
        callbacks?.onPlan?.({
            files: files.map((f) => ({ path: f.path, purpose: f.purpose })),
            techStack: plan.techStack || [],
            framework: requirements?.framework || config.defaultFramework,
            stylingFramework: requirements?.stylingFramework || 'plain-css',
        });
        callbacks?.onProgress?.('Starting generation...', 0);
        return {
            phase: PHASE_SEQUENTIAL,
            sequentialIndex: 0,
            concurrentIndex: 0,
            filesCompleted: 0,
            stepCount: 0,
            structureWarnings: [],
            reviewValidated: false,
            lastError: null,
        };
    }

    async function generateFileNode(state, config) {
        const runConfig = config?.configurable || {};
        const service = runConfig.service;
        const callbacks = runConfig.callbacks;
        if (!service || !callbacks) throw new Error('Missing service or callbacks in config');

        const { sequential = [], concurrent = [], phase, sequentialIndex = 0, concurrentIndex = 0, filesCompleted = 0 } = state;
        const totalFiles = (state.sortedFiles || []).length;

        let fileInfo;
        if (phase === PHASE_SEQUENTIAL && sequentialIndex < sequential.length) {
            fileInfo = sequential[sequentialIndex];
        } else if (phase === PHASE_CONCURRENT && concurrentIndex < concurrent.length) {
            fileInfo = concurrent[concurrentIndex];
        } else {
            return { stepCount: (state.stepCount || 0) + 1 };
        }

        const toolState = {
            ...state,
            callbacks,
            generationId: state.generationId,
            userPrompt: state.userPrompt,
            requirements: state.requirements,
            plan: state.plan,
            projectDir: state.projectDir,
            generatedFiles: state.generatedFiles || {},
        };

        const result = await tools.execute('generate_file', toolState, { fileInfo });

        const newSequentialIndex = phase === PHASE_SEQUENTIAL ? sequentialIndex + 1 : sequentialIndex;
        const newConcurrentIndex = phase === PHASE_CONCURRENT ? concurrentIndex + 1 : concurrentIndex;
        let newPhase = phase;
        if (phase === PHASE_SEQUENTIAL && newSequentialIndex >= sequential.length) {
            // Transition to concurrent phase if there are concurrent files, otherwise go straight to review
            newPhase = concurrent.length > 0 ? PHASE_CONCURRENT : PHASE_REVIEW;
        } else if (phase === PHASE_CONCURRENT && newConcurrentIndex >= concurrent.length) {
            newPhase = PHASE_REVIEW;
        }

        const delta = {
            stepCount: (state.stepCount || 0) + 1,
            filesCompleted: filesCompleted + (result.success ? 1 : 0),
            lastError: result.success ? null : result.error,
            phase: newPhase,
            sequentialIndex: newPhase === PHASE_CONCURRENT ? 0 : newSequentialIndex,
            concurrentIndex: newConcurrentIndex,
            generatedFiles: toolState.generatedFiles ? { ...toolState.generatedFiles } : undefined,
        };
        if (result.stateDelta) Object.assign(delta, result.stateDelta);

        const progress = totalFiles > 0 ? Math.min(95, Math.floor((delta.filesCompleted / totalFiles) * 90)) : 0;
        callbacks?.onProgress?.(`Step ${delta.stepCount} — ${phase}...`, progress, { currentPhase: phase });

        return delta;
    }

    async function validateProjectNode(state, config) {
        const runConfig = config?.configurable || {};
        const service = runConfig.service;
        if (!service) throw new Error('Missing service in config');

        const toolState = { ...state, callbacks: runConfig.callbacks };
        const result = await tools.execute('validate_project', toolState, {});
        return {
            ...result.stateDelta,
            stepCount: (state.stepCount || 0) + 1,
        };
    }

    async function fixCrossFileNode(state, config) {
        const runConfig = config?.configurable || {};
        const service = runConfig.service;
        const callbacks = runConfig.callbacks;
        if (!service || !callbacks) throw new Error('Missing service or callbacks in config');

        const toolState = { ...state, callbacks };
        const result = await tools.execute('fix_cross_file', toolState, { warnings: state.structureWarnings || [] });
        return {
            ...(result.stateDelta || {}),
            stepCount: (state.stepCount || 0) + 1,
        };
    }

    function routeAfterEmitPlan(state) {
        const { sequential = [], concurrent = [] } = state;
        if (sequential.length > 0 || concurrent.length > 0) return 'generate_file';
        return 'validate_project';
    }

    function routeAfterGenerateFile(state) {
        const maxSteps = config.agent?.maxSteps ?? 500;
        if ((state.stepCount || 0) >= maxSteps) return 'validate_project';
        const { sequential = [], concurrent = [], phase, sequentialIndex = 0, concurrentIndex = 0 } = state;
        if (phase === PHASE_SEQUENTIAL && sequentialIndex < sequential.length) return 'generate_file';
        if (phase === PHASE_CONCURRENT && concurrentIndex < concurrent.length) return 'generate_file';
        return 'validate_project';
    }

    function routeAfterValidate(state) {
        const warnings = state.structureWarnings || [];
        if (warnings.length > 0) return 'fix_cross_file';
        return END;
    }

    const builder = new StateGraph(GenerationState)
        .addNode('emit_plan', emitPlan)
        .addNode('generate_file', generateFileNode)
        .addNode('validate_project', validateProjectNode)
        .addNode('fix_cross_file', fixCrossFileNode)
        .addEdge(START, 'emit_plan')
        .addConditionalEdges('emit_plan', routeAfterEmitPlan, ['generate_file', 'validate_project'])
        .addConditionalEdges('generate_file', routeAfterGenerateFile, ['generate_file', 'validate_project'])
        .addConditionalEdges('validate_project', routeAfterValidate, ['fix_cross_file', END])
        .addEdge('fix_cross_file', END);

    _compiledGraph = builder.compile();
    return _compiledGraph;
}

/**
 * Run one generation using the LangGraph. Prepares initial state (sorted files, phase), invokes the graph with service/callbacks in configurable.
 *
 * @param {import('../services/projectGeneration.js').ProjectGenerationService} service
 * @param {object} params - Same shape as orchestrator.run(): generationId, userPrompt, requirements, plan, projectDir, callbacks
 * @returns {Promise<{ success: boolean, projectId?: string, duration?: number, filesGenerated?: number, error?: string, stepsUsed?: number }>}
 */
export async function runGenerationGraph(service, params) {
    const startTime = Date.now();
    const { generationId, userPrompt, requirements, plan, projectDir, callbacks } = params;
    const files = plan?.files || [];
    if (files.length === 0) {
        return { success: false, error: 'No files in plan', duration: 0, stepsUsed: 0 };
    }

    const sortedFiles = service._sortFiles(files, requirements?.framework);
    const { sequential, concurrent } = service._classifyDependencies(sortedFiles, requirements?.framework);

    const initialState = {
        generationId,
        plan,
        requirements,
        userPrompt,
        projectDir,
        generatedFiles: {},
        sortedFiles,
        sequential,
        concurrent,
        phase: PHASE_SEQUENTIAL,
        sequentialIndex: 0,
        concurrentIndex: 0,
        filesCompleted: 0,
        structureWarnings: [],
        reviewValidated: false,
        stepCount: 0,
        lastError: null,
    };

    const graph = buildGraph(service);

    let finalState;
    try {
        finalState = await graph.invoke(initialState, {
            configurable: { service, callbacks },
        });
    } catch (err) {
        logger.error(`LangGraph generation error: ${err.message}`, { generationId });
        return {
            success: false,
            error: err.message,
            duration: (Date.now() - startTime) / 1000,
            stepsUsed: initialState.stepCount,
        };
    }

    const duration = (Date.now() - startTime) / 1000;
    // Success: no error, review phase was reached (all files generated), and no outstanding cross-file warnings
    const reachedReview = finalState.phase === PHASE_REVIEW || finalState.phase === PHASE_DONE;
    const success = !finalState.lastError && reachedReview && (finalState.structureWarnings || []).length === 0;
    const projectId = projectDir ? projectDir.split(/[/\\]/).pop() : null;
    const filesGenerated = Object.keys(finalState.generatedFiles || {}).length;

    if (success) {
        logger.info(`LangGraph finished in ${duration}s — ${finalState.stepCount} steps, ${filesGenerated} files`, { generationId });
    } else if (finalState.lastError) {
        logger.error(`LangGraph stopped: ${finalState.lastError}`, { generationId });
    }

    return {
        success,
        projectId,
        duration,
        filesGenerated,
        partialSuccess: !success && filesGenerated > 0,
        error: finalState.lastError || undefined,
        stepsUsed: finalState.stepCount ?? 0,
    };
}

export { buildGraph, GenerationState };
