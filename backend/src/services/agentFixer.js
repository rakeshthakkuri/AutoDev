// ═══════════════════════════════════════════════════════════════════════════════
// Agent Fixer — LLM-powered self-healing for generated code
// ═══════════════════════════════════════════════════════════════════════════════

import path from 'path';
import { generateFix } from './llm.js';
import { CodeValidator } from './validator.js';
import logger from './logger.js';
import config from '../config.js';
import { sortFilesByDependency } from '../agents/planner/dependencyGraph.js';
import { validateImportResolution } from './importResolver.js';
import { compressContract } from '../agents/shared/contracts.js';

export class AgentFixer {
    /**
     * @param {import('./validator.js').CodeValidator} [validator] - Optional shared validator instance; if not provided, creates one.
     */
    constructor(validator) {
        this.validator = validator || new CodeValidator();
    }

    /**
     * Attempt to fix a single file using LLM feedback.
     *
     * @param {object} params
     * @param {string} params.code - The current (broken) code
     * @param {string} params.filePath - e.g. "src/App.jsx"
     * @param {string[]} params.errors - Validation errors
     * @param {string[]} params.warnings - Validation warnings
     * @param {string} params.userPrompt - Original user prompt for context
     * @param {Record<string, string>} params.contextFiles - Other generated files for reference
     * @param {Array<{ path: string, content: string }>} [params.importingFiles] - Files that import this file (for default-export fixes)
     * @param {string} params.framework - Project framework (e.g. "vanilla-js", "react")
     * @param {function} [params.onFixAttempt] - Callback: ({ path, attempt, totalAttempts, errors }) => void
     * @returns {Promise<{ code: string, validation: object, fixed: boolean, attempts: number }>}
     */
    async fixFileWithFeedback({ code, filePath, errors, warnings, userPrompt, contextFiles, importingFiles, framework, onFixAttempt }) {
        let currentCode = code;
        let lastValidation = null;
        let currentErrors = [...errors];
        let currentWarnings = [...(warnings || [])];

        const isTruncationError = currentErrors.some(e =>
            e.toLowerCase().includes('truncat') || e.toLowerCase().includes('unterminated')
        );
        const maxAttempts = isTruncationError ? config.agent.maxFixAttemptsTruncation : config.agent.maxFixAttempts;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            logger.info(`Agent fix attempt ${attempt}/${maxAttempts} for ${filePath} — errors: ${currentErrors.length}`);

            // Notify frontend about the fix attempt
            onFixAttempt?.({
                path: filePath,
                attempt,
                totalAttempts: maxAttempts,
                errors: currentErrors,
            });

            const fixPrompt = this._buildFixPrompt({
                code: currentCode,
                filePath,
                errors: currentErrors,
                warnings: currentWarnings,
                userPrompt,
                contextFiles,
                importingFiles,
            });

            try {
                // The dispatcher now handles transient retries (~60s budget). We don't
                // need our own retry loop here. If the call fails it's either a hard
                // error (auth/etc) or transient retries were already exhausted —
                // either way, don't burn time on more local retries.
                let fixedCode = null;
                try {
                    fixedCode = await generateFix(fixPrompt);
                } catch (e) {
                    logger.warn(`generateFix failed for ${filePath}: ${e.message}`);
                }

                if (!fixedCode || fixedCode.trim().length < 10) {
                    logger.warn(`Agent fix returned empty/short result for ${filePath}, keeping original`);
                    continue;
                }

                // Clean up the response (strip markdown fences if the LLM added them)
                const cleanedCode = this._cleanFixResponse(fixedCode, filePath);

                // Re-validate
                const validation = this.validator.validateFile(cleanedCode, filePath, framework);
                lastValidation = validation;

                const finalCode = validation.fixedCode || cleanedCode;

                if (validation.isValid) {
                    logger.info(`Agent fix SUCCEEDED for ${filePath} on attempt ${attempt}`);
                    return {
                        code: finalCode,
                        validation,
                        fixed: true,
                        attempts: attempt,
                    };
                }

                // Update for next iteration
                currentCode = finalCode;
                currentErrors = validation.errors || [];
                currentWarnings = validation.warnings || [];

                logger.info(`Agent fix attempt ${attempt} for ${filePath} — still ${currentErrors.length} error(s)`);
            } catch (e) {
                logger.error(`Agent fix attempt ${attempt} failed for ${filePath}: ${e.message}`);
                // Continue to next attempt
            }
        }

        // Exhausted all fix attempts — return the best we have
        logger.warn(`Agent fix exhausted ${maxAttempts} attempts for ${filePath}`);
        return {
            code: currentCode,
            validation: lastValidation || this.validator.validateFile(currentCode, filePath, framework),
            fixed: false,
            attempts: maxAttempts,
        };
    }

    /**
     * Fix cross-file issues after all files are generated.
     *
     * @param {object} params
     * @param {Record<string, string>} params.files - All generated files
     * @param {string[]} params.structureErrors - Cross-file validation warnings
     * @param {string} params.userPrompt - Original user prompt
     * @param {string} params.framework - Project framework
     * @param {function} [params.onFixAttempt] - Callback for fix progress
     * @returns {Promise<Record<string, { code: string, validation: object }>>} - Map of fixed files
     */
    async fixCrossFileIssues({ files, structureErrors, userPrompt, framework, onFixAttempt }) {
        if (!structureErrors || structureErrors.length === 0) return {};

        const fixedFiles = {};

        // Group errors by the file they reference
        const errorsByFile = {};
        for (const warning of structureErrors) {
            // warnings are like "src/App.jsx: imports 'components/Header' but file not found"
            const colonIdx = warning.indexOf(':');
            if (colonIdx > 0) {
                const filePath = warning.substring(0, colonIdx).trim();
                if (files[filePath]) {
                    if (!errorsByFile[filePath]) errorsByFile[filePath] = [];
                    errorsByFile[filePath].push(warning.substring(colonIdx + 1).trim());
                }
            }
        }

        // For "imported as default but has no default export" we need to show the importing file(s) so the agent knows what to add
        const getImportingFiles = (targetPath) => {
            const baseName = path.basename(targetPath, path.extname(targetPath));
            const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const defaultImportRe = new RegExp(`import\\s+\\w+\\s+from\\s+['"][^'"]*${escaped}['"]`, 'i');
            return Object.entries(files)
                .filter(([p, c]) => p !== targetPath && typeof c === 'string' && defaultImportRe.test(c))
                .map(([p, c]) => ({ path: p, content: c }));
        };

        // Fix each affected file
        for (const [filePath, fileErrors] of Object.entries(errorsByFile)) {
            logger.info(`Agent fixing cross-file issues in ${filePath}: ${fileErrors.length} issue(s)`);

            const hasDefaultExportError = fileErrors.some(e =>
                /imported as default|no default export/i.test(e)
            );
            const importingFiles = hasDefaultExportError ? getImportingFiles(filePath) : undefined;

            const result = await this.fixFileWithFeedback({
                code: files[filePath],
                filePath,
                errors: fileErrors,
                warnings: [],
                userPrompt,
                contextFiles: files,
                importingFiles,
                framework,
                onFixAttempt,
            });

            if (result.fixed || result.code !== files[filePath]) {
                fixedFiles[filePath] = {
                    code: result.code,
                    validation: result.validation,
                };
            }
        }

        return fixedFiles;
    }

    /**
     * Fix import/export issues in topological (dependency-first) order.
     * @param {Record<string, string>} projectFiles
     * @param {{ importIssues: object[] }} validationResult
     * @param {import('../agents/shared/memory.js').ProjectMemory | null} memory
     * @param {string} framework
     * @param {string} [userPrompt]
     * @param {(msg: string) => void} [onProgress]
     */
    async fixProjectInOrder(projectFiles, validationResult, memory, framework, userPrompt = '', onProgress) {
        const MAX_PASSES = 2;
        let currentFiles = { ...projectFiles };
        let currentIssues = validationResult.importIssues || [];

        for (let pass = 0; pass < MAX_PASSES; pass++) {
            if (currentIssues.length === 0) break;

            logger.info(`Import repair pass ${pass + 1}`, { issueCount: currentIssues.length });

            const issuesByFile = {};
            for (const issue of currentIssues) {
                if (!issuesByFile[issue.file]) issuesByFile[issue.file] = [];
                issuesByFile[issue.file].push(issue);
            }

            const filesToFix = Object.keys(issuesByFile);
            const planLike = { files: filesToFix.map(p => ({ path: p })) };
            const sortedPaths = sortFilesByDependency(planLike);

            for (const filePath of sortedPaths) {
                const issues = issuesByFile[filePath];
                if (!issues) continue;
                const fileCode = currentFiles[filePath];
                if (!fileCode) continue;

                onProgress?.(`Repairing ${filePath} (${issues.length} issue${issues.length !== 1 ? 's' : ''})`);

                const errorContext = buildImportRepairContext(issues, currentFiles);

                try {
                    const result = await this.fixFileWithFeedback({
                        code: fileCode,
                        filePath,
                        errors: [errorContext],
                        warnings: [],
                        userPrompt: userPrompt || 'Fix import/export mismatches only.',
                        contextFiles: currentFiles,
                        framework,
                        onFixAttempt: () => {},
                    });

                    if (result.code && result.code !== fileCode) {
                        currentFiles[filePath] = result.code;
                        if (memory) {
                            memory.setFileFixed(filePath, result.code, result.validation);
                            memory.recordGeneratedContract(filePath, compressContract(filePath, result.code));
                        }
                        logger.info('Import repair updated file', { filePath });
                    }
                } catch (err) {
                    logger.warn('Import repair failed for file', { filePath, error: err.message });
                }
            }

            const newIssues = validateImportResolution(currentFiles);
            logger.info(`Import repair pass ${pass + 1} complete`, {
                before: currentIssues.length,
                after: newIssues.length,
            });

            if (newIssues.length >= currentIssues.length && pass > 0) break;
            currentIssues = newIssues;
        }

        return {
            files: currentFiles,
            remainingIssues: currentIssues,
            repaired: currentIssues.length === 0,
        };
    }

    /**
     * Build the repair prompt for the LLM.
     */
    _buildFixPrompt({ code, filePath, errors, warnings, userPrompt, contextFiles, importingFiles }) {
        const errorBlob = errors.join(' \n ').toLowerCase();
        const isTruncated = /truncat|unterminated|unexpected end|unexpected eof/i.test(errorBlob);
        const isDefaultExportError = /imported as default|no default export/i.test(errorBlob);
        const isUnclosedJsx = /unclosed|unmatched|expected \w+ tag/i.test(errorBlob);
        const isMissingImport = /not defined|undefined|cannot find/i.test(errorBlob);

        let prompt = `The following file was generated for a web project but has validation errors that need to be fixed.

FILE: ${filePath}
ORIGINAL USER REQUEST: ${(userPrompt || '').substring(0, 300)}

VALIDATION ERRORS (must fix):
${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}
`;

        if (isTruncated) {
            prompt += `
TRUNCATION RECOVERY:
The previous output was truncated mid-file. You MUST output the COMPLETE file from start to finish.
- Do NOT just output the missing ending — write the WHOLE file again.
- If the original implementation is too large to fit, SIMPLIFY (fewer sections, shorter copy) but keep all core behavior.
- Final character of your output MUST close the file cleanly: matched braces/parens/JSX tags, terminated strings, a valid trailing newline.
`;
        }

        if (isUnclosedJsx) {
            prompt += `
JSX/HTML BALANCE:
Walk every opening tag and ensure a matching close. Self-closing tags (<img />, <br />, <input />) must end with /> in JSX. Components like <Card> must have </Card>. Do NOT leave any element open.
`;
        }

        if (isMissingImport) {
            prompt += `
MISSING IMPORTS:
For every identifier the validator flagged as not defined, either (a) add the correct import at the top of the file (using the project's existing module paths shown in OTHER PROJECT FILES below), or (b) remove the usage. Do NOT silently leave a reference dangling.
`;
        }

        if (warnings && warnings.length > 0) {
            prompt += `\nWARNINGS (fix if possible):
${warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}
`;
        }

        // When fixing missing default export, show the importing file(s) so the agent knows what export to add
        if (isDefaultExportError && importingFiles && importingFiles.length > 0) {
            prompt += `\nFILES THAT IMPORT THIS FILE (add the default export they expect — e.g. export default ComponentName):\n`;
            for (const { path: p, content: c } of importingFiles) {
                const snippet = (c || '').substring(0, 1200);
                prompt += `--- ${p} ---\n${snippet}\n${(c || '').length > 1200 ? '// ... truncated\n' : ''}\n`;
            }
        }

        prompt += `\nCURRENT CODE:\n\`\`\`\n${code}\n\`\`\`\n`;

        // Add context of other files for import resolution
        if (contextFiles && Object.keys(contextFiles).length > 0) {
            const excludePaths = new Set([filePath, ...(importingFiles || []).map(f => f.path)]);
            const contextEntries = Object.entries(contextFiles)
                .filter(([p]) => !excludePaths.has(p))
                .slice(0, 6); // Limit context to 6 files

            if (contextEntries.length > 0) {
                prompt += `\nOTHER PROJECT FILES (for import/reference resolution):\n`;
                for (const [p, content] of contextEntries) {
                    const truncated = (content || '').substring(0, 800);
                    prompt += `--- ${p} ---\n${truncated}\n${content && content.length > 800 ? '// ... truncated\n' : ''}\n`;
                }
            }
        }

        prompt += `\nFix ALL the errors listed above. Output ONLY the complete corrected code for ${filePath}. No markdown fences, no explanations.`;

        return prompt;
    }

    /**
     * Clean up fix response — strip markdown fences etc.
     */
    _cleanFixResponse(code, filePath) {
        let cleaned = code.trim();

        // Strip markdown code fences
        const fencePattern = /^```(?:\w+)?\s*\n?([\s\S]*?)```\s*$/;
        const match = cleaned.match(fencePattern);
        if (match) {
            cleaned = match[1].trim();
        }

        // Strip leading/trailing triple backticks without full fence
        cleaned = cleaned.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();

        // Strip common LLM preamble phrases
        const preambles = [
            /^Here(?:'s| is) the (?:corrected|fixed|updated) (?:code|file)[^:]*:\s*/i,
            /^(?:The )?(?:corrected|fixed|updated) (?:code|file)[^:]*:\s*/i,
            /^Sure[,!]?\s*/i,
            /^Certainly[,!]?\s*/i,
        ];
        for (const re of preambles) {
            cleaned = cleaned.replace(re, '');
        }

        return cleaned;
    }
}

function buildImportRepairContext(issues, projectFiles) {
    const lines = ['The following import/export issues were found in this file:'];

    for (const issue of issues) {
        lines.push(`\n[${issue.type}] ${issue.message}`);
        if (issue.availableExports?.length) {
            lines.push(`  Available exports from ${issue.targetFile}: ${issue.availableExports.join(', ')}`);
        }
        if (issue.type === 'FILE_NOT_FOUND') {
            lines.push(`  The import path "${issue.importedPath}" does not resolve to a project file.`);
        }
    }

    lines.push('\nFix ALL import statements to use correct export names and paths.');
    lines.push('Do not change application logic — only fix imports/exports.');

    return lines.join('\n');
}
