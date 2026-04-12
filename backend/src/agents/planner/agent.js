import logger from '../../services/logger.js';
import { generateCompletion } from '../../services/llm.js';
import { validatePlan as validatePlanStructure, FILE_COUNT_BOUNDS } from './validators.js';
import { generateInterfaceManifest } from './interfaceManifest.js';
import { PLAN_REVISION_PROMPT } from './prompts.js';
import { createError } from '../shared/errors.js';

/**
 * Planner Agent — creates and validates project file plans.
 * Wraps the existing AnalysisService with plan quality gates and revision logic.
 */
export class PlannerAgent {
    /**
     * @param {{ analysisService: import('../../services/analysis.js').AnalysisService }} services
     */
    constructor(services) {
        this.analysisService = services.analysisService;
    }

    /**
     * Create an initial plan using the existing analysis service.
     * Returns state delta with plan and planValidation.
     */
    async createPlan(state) {
        const { requirements, memory } = state;
        logger.info('[PlannerAgent] Creating plan', { framework: requirements?.framework });

        try {
            const plan = await this.analysisService.generatePlan(requirements);

            // Populate memory with planned files
            if (plan?.files && memory) {
                for (const file of plan.files) {
                    memory.addPlannedFile(file.path, file.purpose);
                }
                if (plan.designSystem) {
                    memory.setDesignSystem(plan.designSystem);
                }
                memory.addDecision('planner', 'create_plan', `Created plan with ${plan.files.length} files`);
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
            throw err;
        }
    }

    /**
     * Validate an existing plan.
     * Returns state delta with planValidation result.
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
     * Revise a plan based on validation errors.
     * Calls the LLM with the original plan + errors to produce a fixed version.
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

        const prompt = PLAN_REVISION_PROMPT
            .replace('{errors}', errorsText)
            .replace('{plan}', JSON.stringify(plan, null, 2))
            .replace('{userPrompt}', userPrompt || '')
            .replace('{framework}', framework)
            .replace('{complexity}', complexity)
            .replace('{minFiles}', String(minFiles))
            .replace('{maxFiles}', String(maxFiles));

        try {
            const response = await generateCompletion(prompt, 'You are a project planning agent. Return only valid JSON.');
            const revised = JSON.parse(response.replace(/```json?\n?/g, '').replace(/```/g, '').trim());

            // Update memory with revised plan
            if (memory && revised?.files) {
                // Clear old planned files and add new ones
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
            // Return the original plan — proceed with imperfect plan
            return {
                planRevisions: planRevisions + 1,
            };
        }
    }
}
