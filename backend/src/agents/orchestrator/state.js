// ═══════════════════════════════════════════════════════════════════════════════
// Orchestrator State — ProjectState schema, error budgets, quality levels
// ═══════════════════════════════════════════════════════════════════════════════

import config from '../../config.js';

/**
 * Quality levels — communicated to the user via SSE.
 */
export const QUALITY_LEVELS = {
    FULL: 'full',                // All files generated and validated clean
    REPAIRED: 'repaired',        // Some files needed agent fix (acceptable)
    PARTIAL: 'partial',          // Some files failed but project is functional
    DEGRADED: 'degraded',        // Significant failures, project may not work
    TEMPLATE_ONLY: 'template',   // Fell back entirely to templates
};

/**
 * Orchestrator phases.
 */
export const PHASES = {
    PLANNING: 'planning',
    PLAN_VALIDATION: 'plan_validation',
    GENERATING: 'generating',
    REVIEWING: 'reviewing',
    FIXING: 'fixing',
    DONE: 'done',
    FAILED: 'failed',
};

/**
 * Initialize an error budget for the project.
 * Controls how many failures are tolerable before degrading.
 *
 * @param {object} plan - The file plan
 * @returns {object} Error budget
 */
export function initializeErrorBudget(plan) {
    const totalFiles = (plan?.files || []).length;
    return {
        // Allow 20% of files to fail (minimum 1)
        filesAllowed: Math.max(1, Math.floor(totalFiles * 0.2)),
        filesUsed: 0,

        // Plan revisions
        planRevisionsAllowed: 2,
        planRevisionsUsed: 0,

        // Fix rounds (full project review → fix cycles)
        fixRoundsAllowed: 2,
        fixRoundsUsed: 0,

        // Global token budget (prevent runaway costs)
        maxTotalTokens: totalFiles * 12000,
        tokensUsed: 0,

        // Time budget
        maxDurationMs: config.generation.maxTotalTimeout || 600000,
        startTime: Date.now(),
    };
}

/**
 * Check if the generation is still within budget.
 */
export function isWithinBudget(budget) {
    if (!budget) return true;
    const timeElapsed = Date.now() - budget.startTime;
    return (
        budget.filesUsed < budget.filesAllowed &&
        budget.tokensUsed < budget.maxTotalTokens &&
        timeElapsed < budget.maxDurationMs
    );
}

/**
 * Determine the quality level of the finished project.
 */
export function assessQuality(memory) {
    if (!memory) return QUALITY_LEVELS.FULL;

    const counts = memory.getStatusCounts();
    const total = memory.files.size;
    if (total === 0) return QUALITY_LEVELS.TEMPLATE_ONLY;

    const failedPct = counts.failed / total;
    const fixedPct = counts.fixed / total;

    if (counts.failed === 0 && counts.fixed === 0) return QUALITY_LEVELS.FULL;
    if (counts.failed === 0) return QUALITY_LEVELS.REPAIRED;
    if (failedPct < 0.2) return QUALITY_LEVELS.PARTIAL;
    if (failedPct < 0.5) return QUALITY_LEVELS.DEGRADED;
    return QUALITY_LEVELS.TEMPLATE_ONLY;
}

/**
 * Create the initial state for the orchestrator graph.
 */
export function createInitialState({ generationId, userPrompt, sessionId, requirements, plan, memory, emitter, projectDir }) {
    return {
        // Identity
        generationId,
        userPrompt,
        sessionId,
        projectDir,

        // Plan
        plan,
        planRevisions: 0,
        planValidation: null,

        // Requirements
        requirements,

        // Memory & events
        memory,
        emitter,

        // Generation tracking
        phase: PHASES.PLANNING,
        fileQueue: [],
        currentFileIndex: 0,

        // Error tracking
        errorBudget: initializeErrorBudget(plan),

        // Review
        reviewResult: null,
        fixRounds: 0,

        // Metrics
        metrics: {
            startTime: Date.now(),
            tokensUsed: { prompt: 0, completion: 0 },
            llmCalls: 0,
            fixAttempts: 0,
            filesGenerated: 0,
            filesFixed: 0,
            filesFailed: 0,
        },

        // Control
        stepCount: 0,
        maxSteps: config.agent?.maxSteps ?? 500,
    };
}
