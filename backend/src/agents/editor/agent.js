// ═══════════════════════════════════════════════════════════════════════════════
// Editor Agent — handles user edits and propagates changes
// Three modes: direct edit, prompt refinement, feature addition
// ═══════════════════════════════════════════════════════════════════════════════

import logger from '../../services/logger.js';
import { generateCompletion } from '../../services/llm.js';
import { extractContracts } from '../shared/contracts.js';
import { ChangeImpactAnalyzer } from './differ.js';
import { ContextBuilder } from '../coder/context.js';
import { PROPAGATE_CHANGE_PROMPT, PROMPT_REFINEMENT_PROMPT, FEATURE_ADDITION_PROMPT } from './prompts.js';
import { formatContractCompact } from '../shared/contracts.js';

/**
 * Editor Agent — handles all three edit modes.
 */
export class EditorAgent {
    /**
     * @param {{ validator: import('../../services/validator.js').CodeValidator, generationService: import('../../services/projectGeneration.js').ProjectGenerationService }} services
     */
    constructor(services) {
        this.validator = services.validator;
        this.generationService = services.generationService;
        this.impactAnalyzer = new ChangeImpactAnalyzer();
    }

    /**
     * Handle a direct edit — user changed code in the editor.
     * Analyze impact and fix dependent files.
     *
     * @param {object} params
     * @param {string} params.filePath - Changed file path
     * @param {string} params.newContent - New file content
     * @param {import('../shared/memory.js').ProjectMemory} params.memory
     * @param {import('../shared/events.js').AgentEventEmitter} params.emitter
     * @param {string} params.framework
     * @returns {Promise<{ updatedFiles: Array, metrics: object }>}
     */
    async handleDirectEdit({ filePath, newContent, memory, emitter, framework }) {
        const startTime = Date.now();
        const oldRecord = memory.getFile(filePath);
        const oldContent = oldRecord?.content || '';

        logger.info(`[EditorAgent] Direct edit: ${filePath}`);

        // Update the edited file in memory
        const validation = this.validator.validateFile(newContent, filePath, framework);
        memory.setFileGenerated(filePath, newContent, validation);

        // Analyze impact
        const impact = this.impactAnalyzer.analyzeImpact(filePath, oldContent, newContent, memory);

        emitter?.emitEditStart({
            editType: 'direct',
            changedFile: filePath,
            affectedFiles: impact.directlyAffected.map(a => a.path),
            contractBreaking: impact.contractBreaking,
        });

        const updatedFiles = [];

        // Propagate changes to affected files
        for (const affected of impact.directlyAffected) {
            if (affected.action !== 'fix') continue;

            emitter?.emitEditFileUpdating({ path: affected.path, reason: affected.reason });

            const result = await this._propagateChange(
                filePath, newContent, affected.path, memory, framework
            );

            if (result.updated) {
                memory.setFileFixed(affected.path, result.content, result.validation);
                updatedFiles.push({ path: affected.path, content: result.content });
                emitter?.emitEditFileUpdated({
                    path: affected.path,
                    content: result.content,
                    validation: result.validation,
                });
            }
        }

        const metrics = {
            editType: 'direct',
            duration: (Date.now() - startTime) / 1000,
            filesAffected: impact.directlyAffected.length,
            filesUpdated: updatedFiles.length,
            contractBreaking: impact.contractBreaking,
        };

        emitter?.emitEditComplete({ updatedFiles, metrics });

        return { updatedFiles, metrics };
    }

    /**
     * Handle a prompt refinement — "make the hero bigger and add animations".
     * Identifies affected files and re-generates them.
     *
     * @param {object} params
     * @param {string} params.refinementPrompt
     * @param {string[]} [params.targetFiles] - Optional explicit target files
     * @param {import('../shared/memory.js').ProjectMemory} params.memory
     * @param {import('../shared/events.js').AgentEventEmitter} params.emitter
     * @param {string} params.framework
     * @returns {Promise<{ updatedFiles: Array, metrics: object }>}
     */
    async handlePromptRefinement({ refinementPrompt, targetFiles, memory, emitter, framework }) {
        const startTime = Date.now();

        logger.info(`[EditorAgent] Prompt refinement: "${refinementPrompt.substring(0, 80)}..."`);

        // Identify affected files
        const affected = targetFiles?.length
            ? targetFiles
            : this.impactAnalyzer.identifyAffectedByPrompt(refinementPrompt, memory);

        emitter?.emitEditStart({
            editType: 'prompt',
            refinementPrompt,
            affectedFiles: affected,
        });

        const updatedFiles = [];
        const contextBuilder = new ContextBuilder(memory);

        for (const filePath of affected) {
            const record = memory.getFile(filePath);
            if (!record?.content) continue;

            emitter?.emitEditFileUpdating({ path: filePath, reason: `Applying: "${refinementPrompt.substring(0, 60)}"` });

            const context = contextBuilder.buildContext(filePath, 3000);

            const prompt = PROMPT_REFINEMENT_PROMPT
                .replace('{refinementPrompt}', refinementPrompt)
                .replace('{filePath}', filePath)
                .replace('{currentContent}', record.content)
                .replace('{context}', context);

            try {
                const response = await generateCompletion(prompt, { systemPrompt: 'You are a code editor. Return only the updated file. Output ONLY the raw, complete file contents — no markdown fences, no commentary.' });
                const cleaned = response.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim();
                const validation = this.validator.validateFile(cleaned, filePath, framework);

                if (validation.isValid || validation.fixedCode) {
                    const finalCode = validation.fixedCode || cleaned;
                    memory.setFileGenerated(filePath, finalCode, validation);
                    updatedFiles.push({ path: filePath, content: finalCode });
                    emitter?.emitEditFileUpdated({ path: filePath, content: finalCode, validation });
                }
            } catch (err) {
                logger.error(`[EditorAgent] Refinement failed for ${filePath}: ${err.message}`);
            }
        }

        const metrics = {
            editType: 'prompt',
            duration: (Date.now() - startTime) / 1000,
            filesAffected: affected.length,
            filesUpdated: updatedFiles.length,
        };

        emitter?.emitEditComplete({ updatedFiles, metrics });

        return { updatedFiles, metrics };
    }

    /**
     * Handle a feature addition — "add a contact form page".
     * Runs the planner in additive mode, generates new files, updates existing references.
     *
     * @param {object} params
     * @param {string} params.featurePrompt
     * @param {import('../shared/memory.js').ProjectMemory} params.memory
     * @param {import('../shared/events.js').AgentEventEmitter} params.emitter
     * @param {object} params.requirements
     * @returns {Promise<{ newFiles: Array, updatedFiles: Array, metrics: object }>}
     */
    async handleFeatureAddition({ featurePrompt, memory, emitter, requirements }) {
        const startTime = Date.now();
        const framework = requirements?.framework || 'react';

        logger.info(`[EditorAgent] Feature addition: "${featurePrompt.substring(0, 80)}..."`);

        // Build context of existing project
        const existingFiles = [];
        for (const [p, r] of memory.files) {
            if (!r.contracts) continue;
            existingFiles.push(`${p}: ${formatContractCompact(r.contracts)}`);
        }

        emitter?.emitEditStart({
            editType: 'feature',
            featurePrompt,
        });

        // For now, emit a simplified feature addition
        // Full implementation would involve:
        // 1. Ask planner for new files needed
        // 2. Generate those files
        // 3. Update existing files that need to reference new ones (router, navbar, etc.)

        const metrics = {
            editType: 'feature',
            duration: (Date.now() - startTime) / 1000,
            newFiles: 0,
            updatedFiles: 0,
        };

        emitter?.emitEditComplete({ newFiles: [], updatedFiles: [], metrics });

        return { newFiles: [], updatedFiles: [], metrics };
    }

    /**
     * Propagate a change from one file to a dependent file.
     */
    async _propagateChange(changedPath, newContent, targetPath, memory, framework) {
        const targetRecord = memory.getFile(targetPath);
        if (!targetRecord?.content) return { updated: false };

        const prompt = PROPAGATE_CHANGE_PROMPT
            .replace('{changedPath}', changedPath)
            .replace('{reason}', 'File was modified by user')
            .replace('{newContent}', newContent.substring(0, 3000))
            .replace('{targetPath}', targetPath)
            .replace('{targetContent}', targetRecord.content);

        try {
            const response = await generateCompletion(prompt, { systemPrompt: 'You are a code editor. Return only the updated file. Output ONLY the raw, complete file contents — no markdown fences, no commentary.' });
            const cleaned = response.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim();
            const validation = this.validator.validateFile(cleaned, targetPath, framework);

            return {
                updated: true,
                content: validation.fixedCode || cleaned,
                validation,
            };
        } catch (err) {
            logger.error(`[EditorAgent] Propagation failed ${changedPath} → ${targetPath}: ${err.message}`);
            return { updated: false };
        }
    }
}
