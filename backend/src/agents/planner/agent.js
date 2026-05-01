import logger from '../../services/logger.js';
import { generateCompletion, ContentLLMError } from '../../services/llm.js';
import { validatePlan as validatePlanStructure, FILE_COUNT_BOUNDS } from './validators.js';
import { generateInterfaceManifest } from './interfaceManifest.js';
import { PLAN_REVISION_PROMPT } from './prompts.js';
import { createError } from '../shared/errors.js';

const STRICT_JSON_SYSTEM_PROMPT =
    'You are a project planning agent. You MUST output ONLY a single valid JSON object. ' +
    'NO markdown code fences (no ```json), NO comments, NO conversational text, NO trailing commas. ' +
    'Output MUST start with { and end with }. Every key and string must be double-quoted.';

const MAX_CONTENT_RETRIES = 2; // beyond the initial attempt → 3 total tries on bad-JSON

function parseJsonResponse(raw) {
    if (typeof raw !== 'string') {
        throw new ContentLLMError('LLM returned non-string response', { provider: 'planner' });
    }
    // Strip common LLM JSON wrappers
    const cleaned = raw
        .replace(/^[\s﻿]*```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const candidate = firstBrace >= 0 && lastBrace > firstBrace
        ? cleaned.slice(firstBrace, lastBrace + 1)
        : cleaned;

    try {
        return JSON.parse(candidate);
    } catch (parseErr) {
        throw new ContentLLMError(`Plan response is not valid JSON: ${parseErr.message}`, {
            provider: 'planner',
            raw,
            parseError: parseErr,
        });
    }
}

/**
 * Run a JSON-returning LLM call with content-error retries (separate from the
 * dispatcher's transient retries). On each retry we tighten the system prompt
 * to remind the LLM that ONLY JSON is acceptable.
 */
async function callWithJsonRetry(buildPrompt) {
    let lastErr = null;
    let baseSystemPrompt = STRICT_JSON_SYSTEM_PROMPT;
    for (let attempt = 0; attempt <= MAX_CONTENT_RETRIES; attempt++) {
        const systemPrompt = attempt === 0
            ? baseSystemPrompt
            : `${baseSystemPrompt} Your previous response could not be parsed (attempt ${attempt}). Output ONLY a single JSON object — no prose, no fences.`;

        try {
            const raw = await generateCompletion(buildPrompt(attempt), {
                systemPrompt,
                temperature: 0,
                responseMimeType: 'application/json',
            });
            return parseJsonResponse(raw);
        } catch (err) {
            lastErr = err;
            if (!(err instanceof ContentLLMError)) throw err; // hard / transient already exhausted by dispatcher
            logger.warn('[PlannerAgent] JSON parse failed — retrying with tighter system prompt', {
                attempt: attempt + 1,
                maxAttempts: MAX_CONTENT_RETRIES + 1,
                error: err.message,
            });
        }
    }
    throw lastErr;
}

/**
 * Planner Agent — creates and validates project file plans.
 * Wraps the AnalysisService with quality gates and revision logic. Failures
 * are surfaced loudly so the orchestrator can return a real error to the user
 * instead of silently shipping a bad plan.
 */
export class PlannerAgent {
    /**
     * @param {{ analysisService: import('../../services/analysis.js').AnalysisService }} services
     */
    constructor(services) {
        this.analysisService = services.analysisService;
    }

    /**
     * Create an initial plan using the analysis service.
     * Returns state delta with plan and planRevisions.
     */
    async createPlan(state) {
        const { requirements, memory, plan: incomingPlan } = state;
        logger.info('[PlannerAgent] Creating plan', { framework: requirements?.framework });

        // Reject incoming client plans that came from a previous fallback path.
        const isClientFallback = !!(incomingPlan && (incomingPlan.isFallback || incomingPlan._fallbackOrigin));
        const canReuseIncomingPlan = !!(
            incomingPlan
            && Array.isArray(incomingPlan.files)
            && incomingPlan.files.length > 0
            && !isClientFallback
        );

        if (isClientFallback) {
            logger.warn('[PlannerAgent] Discarding client-supplied fallback plan; re-planning from scratch');
        }

        try {
            const plan = canReuseIncomingPlan
                ? incomingPlan
                : await this.analysisService.generatePlan(requirements);

            if (!plan || !Array.isArray(plan.files) || plan.files.length === 0) {
                throw new Error('Planner returned a plan with no files');
            }

            // Populate memory with planned files
            if (plan?.files && memory) {
                for (const file of plan.files) {
                    memory.addPlannedFile(file.path, file.purpose);
                }
                if (plan.designSystem) {
                    memory.setDesignSystem(plan.designSystem);
                }
                memory.addDecision(
                    'planner',
                    'create_plan',
                    canReuseIncomingPlan
                        ? `Reused client plan with ${plan.files.length} files`
                        : `Created plan with ${plan.files.length} files`
                );
            }

            return {
                plan,
                planRevisions: 0,
            };
        } catch (err) {
            logger.error(`[PlannerAgent] Plan creation failed: ${err.message}`);
            if (memory) {
                memory.addError(createError('LLM_INVALID_JSON', {
                    phase: 'planning',
                    agent: 'planner',
                    message: err.message,
                }));
            }
            // Fail loud — orchestrator catches and returns a real error.
            throw err;
        }
    }

    /**
     * Validate an existing plan. Returns state delta with planValidation result.
     */
    async validatePlan(state) {
        const { plan, requirements, memory } = state;

        const validation = validatePlanStructure(plan, requirements);

        if (validation.valid && plan?.files?.length) {
            logger.info('Plan files sorted by dependency order', {
                fileCount: plan.files.length,
                order: plan.files.map(f => (typeof f === 'string' ? f : f.path)),
                sortApplied: !!plan._sortedByDependency,
            });

            if (memory) {
                try {
                    const manifest = await generateInterfaceManifest(plan, requirements);
                    memory.setInterfaceManifest(manifest);
                    memory.setGenerationOrder(plan.files.map(f => (typeof f === 'string' ? f : f.path)));
                    logger.info('Interface manifest ready', {
                        files: plan.files.length,
                        manifestEntries: Object.keys(manifest).length,
                    });
                } catch (err) {
                    logger.warn('[PlannerAgent] Interface manifest skipped', { error: err.message });
                }
            }
        }

        if (memory) {
            memory.addDecision('planner', 'validate_plan',
                validation.valid
                    ? 'Plan passed validation'
                    : `Plan has ${validation.errors.length} errors, ${validation.warnings.length} warnings`
            );
        }

        logger.info(`[PlannerAgent] Plan validation: ${validation.valid ? 'PASS' : 'FAIL'}`, {
            errors: validation.errors.length,
            warnings: validation.warnings.length,
        });

        return {
            planValidation: validation,
        };
    }

    /**
     * Revise a plan based on validation errors. Failures propagate — the
     * orchestrator's router will decide whether to surface the error.
     */
    async revisePlan(state) {
        const { plan, requirements, planValidation, planRevisions = 0, userPrompt, memory } = state;
        const framework = requirements?.framework || 'react';
        const complexity = requirements?.complexity || 'intermediate';
        const [minFiles, maxFiles] = FILE_COUNT_BOUNDS[complexity] || [3, 20];

        logger.info(`[PlannerAgent] Revising plan (revision ${planRevisions + 1})`);

        const errorsText = (planValidation?.errors || [])
            .map(e => `- ${e.type}: ${e.message}`)
            .join('\n');

        const buildPrompt = () => PLAN_REVISION_PROMPT
            .replace('{errors}', errorsText)
            .replace('{plan}', JSON.stringify(plan, null, 2))
            .replace('{userPrompt}', userPrompt || '')
            .replace('{framework}', framework)
            .replace('{complexity}', complexity)
            .replace('{minFiles}', String(minFiles))
            .replace('{maxFiles}', String(maxFiles));

        try {
            const revised = await callWithJsonRetry(buildPrompt);

            if (!revised || !Array.isArray(revised.files) || revised.files.length === 0) {
                throw new ContentLLMError('Plan revision returned no files', { provider: 'planner', raw: JSON.stringify(revised) });
            }

            // Update memory with revised plan
            if (memory && revised?.files) {
                for (const [path, record] of memory.files) {
                    if (record.status === 'planned') memory.files.delete(path);
                }
                for (const file of revised.files) {
                    memory.addPlannedFile(file.path, file.purpose);
                }
                if (revised.designSystem) {
                    memory.setDesignSystem(revised.designSystem);
                }
                memory.addDecision('planner', 'revise_plan', `Revised plan: ${revised.files.length} files (was ${plan.files.length})`);
            }

            return {
                plan: { ...plan, ...revised },
                planRevisions: planRevisions + 1,
            };
        } catch (err) {
            logger.error(`[PlannerAgent] Plan revision failed: ${err.message}`);
            if (memory) {
                memory.addError(createError('LLM_INVALID_JSON', {
                    phase: 'planning',
                    agent: 'planner',
                    message: `Plan revision failed: ${err.message}`,
                }));
            }
            // Propagate — the orchestrator router will decide whether to retry the
            // revision (within budget) or fail the whole generation.
            throw err;
        }
    }
}
