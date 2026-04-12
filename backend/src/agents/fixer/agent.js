import logger from '../../services/logger.js';
import { generateFix } from '../../services/llm.js';
import { formatContractCompact } from '../shared/contracts.js';
import { createError } from '../shared/errors.js';
import { TARGETED_FIX_PROMPT, CROSS_FILE_FIX_PROMPT, IMPORT_FIX_PROMPT_V2 } from './prompts.js';

/**
 * Fixer Agent — repairs files using root cause analysis.
 * Fixes high-impact root causes first, then individual file errors.
 */
export class FixerAgent {
    /**
     * @param {{ validator: import('../../services/validator.js').CodeValidator, agentFixer: import('../../services/agentFixer.js').AgentFixer }} services
     */
    constructor(services) {
        this.validator = services.validator;
        this.agentFixer = services.agentFixer;
    }

    /**
     * Fix issues identified by the Reviewer.
     * Processes root causes first, then remaining individual errors.
     *
     * @param {object} state - Orchestrator state with reviewResult and memory
     * @returns {object} State delta
     */
    async fixIssues(state) {
        const { reviewResult, memory, requirements, userPrompt } = state;
        const framework = requirements?.framework || 'react';
        let fixedCount = 0;
        let failedCount = 0;

        if (!reviewResult || !memory) {
            return { fixRounds: (state.fixRounds || 0) + 1 };
        }

        logger.info(`[FixerAgent] Starting fix round ${(state.fixRounds || 0) + 1}`, {
            rootCauses: reviewResult.rootCauses?.length || 0,
            errors: reviewResult.errors?.length || 0,
        });

        // Step 1: Fix root causes first (high-impact files)
        const rootCauses = (reviewResult.rootCauses || []).sort((a, b) => b.impact - a.impact);

        for (const cause of rootCauses) {
            if (cause.recommendation === 'regenerate') {
                const record = memory.getFile(cause.file);
                if (!record?.content) continue;

                logger.info(`[FixerAgent] Fixing root cause: ${cause.file} (impacts ${cause.impact} files)`);

                const result = await this._fixSingleFile(cause.file, record, memory, framework, userPrompt);
                if (result.fixed) {
                    fixedCount++;
                    memory.setFileFixed(cause.file, result.content, result.validation);
                    memory.addDecision('fixer', 'fix_root_cause', `Fixed ${cause.file} — root cause impacting ${cause.impact} files`);
                } else {
                    failedCount++;
                }
            }
        }

        // Step 2: Fix remaining individual errors (that aren't root-cause files)
        const rootCauseFiles = new Set(rootCauses.map(rc => rc.file));
        const remainingErrors = (reviewResult.errors || [])
            .filter(e => e.file && !rootCauseFiles.has(e.file));

        // Group errors by file
        const errorsByFile = new Map();
        for (const err of remainingErrors) {
            if (!errorsByFile.has(err.file)) errorsByFile.set(err.file, []);
            errorsByFile.get(err.file).push(err);
        }

        for (const [filePath, errors] of errorsByFile) {
            const record = memory.getFile(filePath);
            if (!record?.content) continue;

            // Try surgical import fix first (no LLM call)
            const importIssues = errors.filter(e => e.type === 'IMPORT_BROKEN' && e.targetExists !== undefined);
            const nonImportIssues = errors.filter(e => e.type !== 'IMPORT_BROKEN' || e.targetExists === undefined);

            if (importIssues.length > 0) {
                const surgicalResult = this.fixImportsSurgically(filePath, record.content, importIssues, memory);

                if (surgicalResult.fixed && nonImportIssues.length === 0) {
                    // Surgical fix resolved all issues for this file — skip LLM
                    logger.info(`[FixerAgent] Surgically fixed ${surgicalResult.fixedCount} import(s) in ${filePath}`);
                    const validation = this.validator.validateFile(surgicalResult.content, filePath, framework);
                    fixedCount++;
                    memory.setFileFixed(filePath, surgicalResult.content, validation);
                    state.emitter?.emitFileFixed({
                        path: filePath,
                        content: surgicalResult.content,
                        validation,
                    });
                    continue;
                }

                // Partial surgical fix — update record content before LLM fixer
                if (surgicalResult.fixedCount > 0) {
                    logger.info(`[FixerAgent] Surgically fixed ${surgicalResult.fixedCount} import(s) in ${filePath}, ${nonImportIssues.length} non-import issues remain`);
                    record.content = surgicalResult.content;
                }
            }

            logger.info(`[FixerAgent] Fixing ${filePath} (${errors.length} errors)`);

            const result = await this._fixSingleFile(filePath, record, memory, framework, userPrompt);
            if (result.fixed) {
                fixedCount++;
                memory.setFileFixed(filePath, result.content, result.validation);
                state.emitter?.emitFileFixed({
                    path: filePath,
                    content: result.content,
                    validation: result.validation,
                });
            } else {
                failedCount++;
            }
        }

        logger.info(`[FixerAgent] Fix round complete: ${fixedCount} fixed, ${failedCount} failed`);

        if (memory) {
            memory.addDecision('fixer', 'fix_round_complete', `Fixed ${fixedCount}, failed ${failedCount}`);
        }

        return {
            fixRounds: (state.fixRounds || 0) + 1,
        };
    }

    /**
     * Fix a single file using the existing AgentFixer with enhanced context.
     */
    async _fixSingleFile(filePath, record, memory, framework, userPrompt) {
        try {
            // Get errors from validation
            const errors = record.validation?.errors || [];
            const errorMessages = errors.map(e => typeof e === 'string' ? e : e.message || JSON.stringify(e));

            // Use the existing agentFixer with enhanced context
            const contextFiles = memory ? memory.getGeneratedFiles() : {};

            const result = await this.agentFixer.fixFileWithFeedback({
                code: record.content,
                filePath,
                errors: errorMessages,
                warnings: record.validation?.warnings || [],
                userPrompt,
                contextFiles,
                framework,
                onFixAttempt: (data) => {
                    // Could emit via state.emitter if available
                },
            });

            const finalCode = result.validation?.fixedCode || result.code;
            const isValid = result.validation?.isValid || result.fixed;

            return {
                fixed: isValid,
                content: finalCode,
                validation: result.validation,
            };
        } catch (err) {
            logger.error(`[FixerAgent] Fix failed for ${filePath}: ${err.message}`);
            return {
                fixed: false,
                content: record.content,
                validation: record.validation,
            };
        }
    }

    /**
     * Surgically fix import issues using pure string manipulation (no LLM calls).
     *
     * For each import issue:
     *   - "rename_import": replace the imported name with the suggestedFix
     *   - "remove_import": remove the entire import line
     *
     * @param {string} filePath - The file being fixed
     * @param {string} content - Current file content
     * @param {Array} importIssues - IMPORT_BROKEN issues with detailed metadata
     * @param {object} memory - ProjectMemory instance
     * @returns {{ fixed: boolean, content: string, fixedCount: number }}
     */
    fixImportsSurgically(filePath, content, importIssues, memory) {
        let result = content;
        let fixedCount = 0;

        for (const issue of importIssues) {
            const { suggestion, suggestedFix, importedName, targetFile } = issue;

            if (!importedName && suggestion === 'remove_import') {
                // Target file doesn't exist — remove any import line referencing the target path
                // issue.targetFile is the raw import path (e.g. './components/Hero')
                const rawTarget = issue.targetFile || targetFile;
                if (rawTarget) {
                    const escapedTarget = rawTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const lineRe = new RegExp(
                        `^\\s*import\\s+.*?\\s+from\\s+['"]${escapedTarget}(?:\\.[a-z]+)?['"]\\s*;?\\s*$`,
                        'gm'
                    );
                    const before = result;
                    result = result.replace(lineRe, '').replace(/\n{3,}/g, '\n\n');
                    if (result !== before) fixedCount++;
                }
                continue;
            }

            if (suggestion === 'rename_import' && importedName && suggestedFix) {
                // Build a regex that targets this specific import name in an import statement
                // for the target file path
                const escapedName = importedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                // For named imports: { OldName } or { OldName, ... } or { ..., OldName }
                // Replace the specifier name
                const namedRe = new RegExp(
                    `(\\b)${escapedName}(\\b)(?=\\s*[,}]|\\s+as\\s)`,
                    'g'
                );

                // For default imports: import OldName from '...'
                const defaultRe = new RegExp(
                    `(import\\s+)${escapedName}(\\s+from\\s)`,
                    'g'
                );

                const before = result;

                // Try named import replacement first (more targeted)
                result = result.replace(namedRe, `$1${suggestedFix}$2`);

                // Try default import replacement
                result = result.replace(defaultRe, `$1${suggestedFix}$2`);

                // Also replace usage of the old name with the new name in the file
                // but ONLY if the old name was the local binding (not aliased)
                if (result !== before) {
                    // Replace usages of the old local name with the new name
                    const usageRe = new RegExp(`\\b${escapedName}\\b`, 'g');
                    result = result.replace(usageRe, suggestedFix);
                    fixedCount++;
                }
                continue;
            }

            if (suggestion === 'remove_import' && importedName) {
                // Remove just this specifier from the import
                // If it's the only specifier, remove the whole line
                const escapedName = importedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                // Check if it's a default import line: import Name from '...'
                const defaultLineRe = new RegExp(
                    `^\\s*import\\s+${escapedName}\\s+from\\s+['"].*?['"]\\s*;?\\s*$`,
                    'gm'
                );

                const before = result;
                const afterDefault = result.replace(defaultLineRe, '');

                if (afterDefault !== result) {
                    result = afterDefault.replace(/\n{3,}/g, '\n\n');
                    fixedCount++;
                    continue;
                }

                // Named specifier inside { ... } — remove just this name
                // e.g. { Foo, Bar } → { Bar } or { Foo } → remove whole line
                const specifierRe = new RegExp(`${escapedName}\\s*,\\s*|,\\s*${escapedName}`, 'g');
                result = result.replace(specifierRe, '');

                // If the braces are now empty: import { } from '...' → remove line
                result = result.replace(/^[ \t]*import\s*\{\s*\}\s*from\s*['"].*?['"]\s*;?\s*$/gm, '');
                result = result.replace(/\n{3,}/g, '\n\n');

                if (result !== before) fixedCount++;
                continue;
            }
        }

        return {
            fixed: fixedCount > 0 && fixedCount >= importIssues.length,
            content: result,
            fixedCount,
        };
    }

    /**
     * Fix cross-file import/export mismatches using targeted prompts.
     */
    async fixCrossFileIssues(filePath, issues, memory, framework) {
        const record = memory.getFile(filePath);
        if (!record?.content) return { fixed: false };

        // Build file contracts context
        const fileContracts = [];
        for (const [p, r] of memory.files) {
            if (p === filePath) continue;
            if (!r.contracts) continue;
            fileContracts.push(`${p}: ${formatContractCompact(r.contracts)}`);
        }

        const prompt = CROSS_FILE_FIX_PROMPT
            .replace('{filePath}', filePath)
            .replace('{issues}', issues.map(i => `- ${i.message}`).join('\n'))
            .replace('{fileContracts}', fileContracts.join('\n'))
            .replace('{currentCode}', record.content);

        try {
            const fixed = await generateFix(prompt);
            const cleaned = fixed.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim();
            const validation = this.validator.validateFile(cleaned, filePath, framework);

            if (validation.isValid) {
                return { fixed: true, content: cleaned, validation };
            }
        } catch (err) {
            logger.error(`[FixerAgent] Cross-file fix failed for ${filePath}: ${err.message}`);
        }

        return { fixed: false };
    }
}
