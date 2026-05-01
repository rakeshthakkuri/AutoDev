// ═══════════════════════════════════════════════════════════════════════════════
// Orchestrator Router — conditional edge logic for the LangGraph state machine
// ═══════════════════════════════════════════════════════════════════════════════

import { PHASES } from './state.js';
import logger from '../../services/logger.js';

/**
 * Route after plan validation.
 * - Valid → emit plan and start generating
 * - Invalid + revisions left → revise plan
 * - Invalid + no revisions → fail loud (no silent imperfect-plan fallthrough)
 */
export function routeAfterPlanValidation(state) {
    const { planValidation, planRevisions = 0 } = state;

    if (planValidation?.valid) {
        logger.info('[Router] Plan valid → emit_plan');
        return 'emit_plan';
    }

    const MAX_PLAN_REVISIONS = 3;
    if (planRevisions < MAX_PLAN_REVISIONS) {
        logger.info(`[Router] Plan invalid (${planValidation?.errors?.length} errors) → revise_plan`);
        return 'revise_plan';
    }

    // Out of revision budget — surface a real error rather than ship a bad plan.
    const reason = (planValidation?.errors || []).slice(0, 3).map(e => e.message).join('; ');
    logger.error(`[Router] Plan still invalid after ${MAX_PLAN_REVISIONS} revisions → failing generation. Reasons: ${reason}`);
    const err = new Error(`Could not produce a valid project plan after ${MAX_PLAN_REVISIONS} revisions. Last reasons: ${reason || 'unknown'}`);
    err.code = 'PLAN_INVALID_AFTER_REVISIONS';
    err.planValidation = planValidation;
    throw err;
}

/**
 * Route after generating a file.
 * - More files in queue → generate next
 * - All files done → review
 * - Step limit reached → review (safety valve)
 */
export function routeAfterGenerate(state) {
    const { fileQueue, currentFileIndex = 0, stepCount = 0, maxSteps } = state;

    // Safety: step limit
    if (stepCount >= maxSteps) {
        logger.warn(`[Router] Step limit reached (${stepCount}) → review`);
        return 'review';
    }

    // More files to generate
    if (fileQueue && currentFileIndex < fileQueue.length) {
        return 'generate_next_file';
    }

    // All files generated → review
    logger.info('[Router] All files generated → review');
    return 'review';
}

/**
 * Route after project review.
 * - All clean → finalize (done)
 * - Fixable issues within budget → fix
 * - Plan-level issues + revisions left → revise plan
 * - Over budget or too many fix rounds → finalize partial
 */
export function routeAfterReview(state) {
    const { reviewResult, fixRounds = 0, errorBudget, planRevisions = 0, stepCount = 0, maxSteps } = state;

    // Safety valve: if approaching step limit, finalize immediately
    if (maxSteps && stepCount >= maxSteps - 5) {
        logger.warn(`[Router] Approaching step limit (${stepCount}/${maxSteps}) → finalize`);
        return 'finalize';
    }

    if (!reviewResult) {
        logger.warn('[Router] No review result → finalize');
        return 'finalize';
    }

    const { critical, errors, warnings, rootCauses } = reviewResult;

    // All valid → done
    if ((critical?.length || 0) === 0 && (errors?.length || 0) === 0) {
        logger.info('[Router] All files valid → finalize');
        return 'finalize';
    }

    // Check for plan-level issues that need re-planning
    const planIssues = [...(critical || []), ...(errors || [])].filter(
        i => i.type === 'MISSING_FILE' || i.type === 'WRONG_FRAMEWORK'
    );

    // Fatal — framework incompatible
    const fatalIssues = (critical || []).filter(i => i.type === 'WRONG_FRAMEWORK');
    if (fatalIssues.length > 0) {
        logger.error('[Router] Fatal framework issue → finalize (degraded)');
        return 'finalize';
    }

    // Plan issues with revisions remaining
    if (planIssues.length > 0 && planRevisions < 2) {
        logger.info(`[Router] ${planIssues.length} plan-level issues → revise_plan`);
        return 'revise_plan';
    }

    // Code issues within fix budget
    const hasFixableIssues = (errors?.length || 0) > 0 || (rootCauses?.length || 0) > 0;
    if (hasFixableIssues && fixRounds < (errorBudget?.fixRoundsAllowed || 2)) {
        logger.info(`[Router] ${errors?.length || 0} fixable errors → fix (round ${fixRounds + 1})`);
        return 'fix';
    }

    // Over budget or too many fix rounds — finalize with what we have
    logger.warn(`[Router] Fix budget exhausted (rounds: ${fixRounds}) → finalize (partial)`);
    return 'finalize';
}

/**
 * Route after fix round.
 * Always goes back to review to verify the fixes worked.
 */
export function routeAfterFix() {
    logger.info('[Router] Fix round complete → review');
    return 'review';
}
