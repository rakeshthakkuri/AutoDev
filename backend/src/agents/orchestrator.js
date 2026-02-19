// ═══════════════════════════════════════════════════════════════════════════════
// Generation Orchestrator — agentic run loop with state and tools
// Decides next action from state, executes via tools, updates state until done.
// ═══════════════════════════════════════════════════════════════════════════════

import config from '../config.js';
import logger from '../services/logger.js';
import { TOOL_NAMES } from './tools.js';

const DEFAULT_MAX_STEPS = 500;
const PHASE_SEQUENTIAL = 'sequential';
const PHASE_CONCURRENT = 'concurrent';
const PHASE_REVIEW = 'review';
const PHASE_DONE = 'done';

/**
 * Agentic orchestrator for project generation.
 * Uses a state machine and tool execution loop instead of a fixed pipeline.
 *
 * @param {{ tools: ReturnType<import('./tools.js').createGenerationTools>, maxSteps?: number }} options
 */
export class GenerationOrchestrator {
    constructor({ tools, maxSteps = config.agent?.maxSteps ?? DEFAULT_MAX_STEPS }) {
        this.tools = tools;
        this.maxSteps = maxSteps;
    }

    /**
     * Run the generation agent loop until done or max steps.
     *
     * @param {object} params
     * @param {string} params.userPrompt
     * @param {object} params.requirements
     * @param {object} params.plan - { files: Array<{ path, purpose }>, techStack }
     * @param {string} params.projectDir
     * @param {object} params.callbacks - onProgress, onFileGenerated, onFileChunk, onError, onPlan, onFileFixing, onFileFixed
     * @param {object} params.service - ProjectGenerationService (for _sortFiles, _classifyDependencies)
     * @returns {Promise<{ success: boolean, projectId?: string, duration?: number, filesGenerated?: number, error?: string, stepsUsed?: number }>}
     */
    async run({ generationId, userPrompt, requirements, plan, projectDir, callbacks, service }) {
        const startTime = Date.now();
        const files = plan?.files || [];
        if (files.length === 0) {
            return { success: false, error: 'No files in plan', duration: 0, stepsUsed: 0 };
        }

        const sortedFiles = service._sortFiles(files, requirements?.framework);
        const { sequential, concurrent } = service._classifyDependencies(sortedFiles, requirements?.framework);

        const state = {
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
            callbacks,
        };

        // Emit plan to frontend
        callbacks?.onPlan?.({
            files: files.map(f => ({ path: f.path, purpose: f.purpose })),
            techStack: plan.techStack || [],
            framework: requirements?.framework || config.defaultFramework,
            stylingFramework: requirements?.stylingFramework || 'plain-css',
        });
        callbacks?.onProgress?.('Starting generation...', 0);

        let lastAction = null;
        const totalFiles = files.length;

        while (state.stepCount < this.maxSteps) {
            const action = this._decideNextAction(state);
            if (!action) {
                state.phase = PHASE_DONE;
                break;
            }

            state.stepCount++;
            lastAction = action;

            logger.info(`Agent step ${state.stepCount}: ${action.tool}`, { generationId: state.generationId, ...(action.params ? { params: Object.keys(action.params) } : {}) });

            const result = await this.tools.execute(action.tool, state, action.params || {});

            if (result.stateDelta) {
                Object.assign(state, result.stateDelta);
            }
            if (action.tool === TOOL_NAMES.GENERATE_FILE && state.phase === PHASE_SEQUENTIAL) {
                state.sequentialIndex++;
            }
            if (!result.success) {
                state.lastError = result.error;
                logger.warn(`Tool ${action.tool} failed: ${result.error}`);
                if (action.tool === TOOL_NAMES.GENERATE_FILE) {
                    state.filesCompleted = (state.filesCompleted || 0) + 1;
                }
            }

            const progress = totalFiles > 0 ? Math.min(95, Math.floor((state.filesCompleted / totalFiles) * 90)) : 0;
            callbacks?.onProgress?.(`Step ${state.stepCount} — ${state.phase}...`, progress, { currentPhase: state.phase });
        }

        const duration = (Date.now() - startTime) / 1000;
        const success = state.phase === PHASE_DONE && state.lastError === null;

        if (success) {
            logger.info(`Orchestrator finished in ${duration}s — ${state.stepCount} steps, ${Object.keys(state.generatedFiles).length} files`, { generationId: state.generationId });
        } else if (state.lastError) {
            logger.error(`Orchestrator stopped: ${state.lastError}`, { generationId: state.generationId });
        }

        const projectId = projectDir ? projectDir.split(/[/\\]/).pop() : null;
        const filesGenerated = Object.keys(state.generatedFiles).length;
        const partialSuccess = !success && filesGenerated > 0;
        return {
            success,
            projectId,
            duration,
            filesGenerated,
            partialSuccess,
            error: state.lastError || undefined,
            stepsUsed: state.stepCount,
        };
    }

    /**
     * Rule-based decision: what tool to run next given current state.
     * Can be replaced later with an LLM planner for adaptive behavior.
     *
     * @param {object} state
     * @returns {{ tool: string, params?: object } | null}
     */
    _decideNextAction(state) {
        const { sequential = [], concurrent = [], phase } = state;

        if (phase === PHASE_SEQUENTIAL) {
            if (state.sequentialIndex < sequential.length) {
                const fileInfo = sequential[state.sequentialIndex];
                return {
                    tool: TOOL_NAMES.GENERATE_FILE,
                    params: { fileInfo },
                };
            }
            state.phase = PHASE_CONCURRENT;
            state.sequentialIndex = 0;
            return this._decideNextAction(state);
        }

        if (phase === PHASE_CONCURRENT) {
            if (state.concurrentIndex < concurrent.length) {
                const fileInfo = concurrent[state.concurrentIndex];
                state.concurrentIndex++;
                return {
                    tool: TOOL_NAMES.GENERATE_FILE,
                    params: { fileInfo },
                };
            }
            state.phase = PHASE_REVIEW;
            return this._decideNextAction(state);
        }

        if (phase === PHASE_REVIEW) {
            if (!state.reviewValidated) {
                return { tool: TOOL_NAMES.VALIDATE_PROJECT, params: {} };
            }
            if (state.structureWarnings?.length > 0) {
                return {
                    tool: TOOL_NAMES.FIX_CROSS_FILE,
                    params: { warnings: state.structureWarnings },
                };
            }
            state.phase = PHASE_DONE;
            return null;
        }

        state.phase = PHASE_DONE;
        return null;
    }
}
