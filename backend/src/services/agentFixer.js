// ═══════════════════════════════════════════════════════════════════════════════
// Agent Fixer — LLM-powered self-healing for generated code
// ═══════════════════════════════════════════════════════════════════════════════

import { generateFix, getMaxTokens } from './llm.js';
import { CodeValidator } from './validator.js';
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console({ format: winston.format.simple() })]
});

const MAX_FIX_ATTEMPTS = 2;

export class AgentFixer {
    constructor() {
        this.validator = new CodeValidator();
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
     * @param {function} [params.onFixAttempt] - Callback: ({ path, attempt, totalAttempts, errors }) => void
     * @returns {Promise<{ code: string, validation: object, fixed: boolean, attempts: number }>}
     */
    async fixFileWithFeedback({ code, filePath, errors, warnings, userPrompt, contextFiles, onFixAttempt }) {
        let currentCode = code;
        let lastValidation = null;
        let currentErrors = [...errors];
        let currentWarnings = [...(warnings || [])];

        for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
            logger.info(`Agent fix attempt ${attempt}/${MAX_FIX_ATTEMPTS} for ${filePath} — errors: ${currentErrors.length}`);

            // Notify frontend about the fix attempt
            onFixAttempt?.({
                path: filePath,
                attempt,
                totalAttempts: MAX_FIX_ATTEMPTS,
                errors: currentErrors,
            });

            const fixPrompt = this._buildFixPrompt({
                code: currentCode,
                filePath,
                errors: currentErrors,
                warnings: currentWarnings,
                userPrompt,
                contextFiles,
            });

            try {
                // If errors mention truncation, give the LLM more room to output a full file
                const isTruncated = currentErrors.some(e =>
                    e.toLowerCase().includes('truncat') || e.toLowerCase().includes('unterminated')
                );
                const maxTokens = isTruncated
                    ? Math.max(getMaxTokens(filePath, 'advanced'), 8192)
                    : getMaxTokens(filePath, 'intermediate');

                const fixedCode = await generateFix(fixPrompt, { maxTokens });

                if (!fixedCode || fixedCode.trim().length < 10) {
                    logger.warn(`Agent fix returned empty/short result for ${filePath}, keeping original`);
                    continue;
                }

                // Clean up the response (strip markdown fences if the LLM added them)
                const cleanedCode = this._cleanFixResponse(fixedCode, filePath);

                // Re-validate
                const validation = this.validator.validateFile(cleanedCode, filePath);
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
        logger.warn(`Agent fix exhausted ${MAX_FIX_ATTEMPTS} attempts for ${filePath}`);
        return {
            code: currentCode,
            validation: lastValidation || this.validator.validateFile(currentCode, filePath),
            fixed: false,
            attempts: MAX_FIX_ATTEMPTS,
        };
    }

    /**
     * Fix cross-file issues after all files are generated.
     *
     * @param {object} params
     * @param {Record<string, string>} params.files - All generated files
     * @param {string[]} params.structureErrors - Cross-file validation warnings
     * @param {string} params.userPrompt - Original user prompt
     * @param {function} [params.onFixAttempt] - Callback for fix progress
     * @returns {Promise<Record<string, { code: string, validation: object }>>} - Map of fixed files
     */
    async fixCrossFileIssues({ files, structureErrors, userPrompt, onFixAttempt }) {
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

        // Fix each affected file
        for (const [filePath, fileErrors] of Object.entries(errorsByFile)) {
            logger.info(`Agent fixing cross-file issues in ${filePath}: ${fileErrors.length} issue(s)`);

            const result = await this.fixFileWithFeedback({
                code: files[filePath],
                filePath,
                errors: fileErrors,
                warnings: [],
                userPrompt,
                contextFiles: files,
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
     * Build the repair prompt for the LLM.
     */
    _buildFixPrompt({ code, filePath, errors, warnings, userPrompt, contextFiles }) {
        const isTruncated = errors.some(e =>
            e.toLowerCase().includes('truncat') || e.toLowerCase().includes('unterminated')
        );

        let prompt = `The following file was generated for a web project but has validation errors that need to be fixed.

FILE: ${filePath}
ORIGINAL USER REQUEST: ${(userPrompt || '').substring(0, 300)}

VALIDATION ERRORS (must fix):
${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}
`;

        if (isTruncated) {
            prompt += `
IMPORTANT: This file was truncated (cut off) because the generation exceeded the token limit.
You MUST output the COMPLETE file from start to finish. Do NOT just output the missing ending.
If the component is too large, simplify it to fit — keep all core functionality but be more concise.
Make sure all JSX tags are properly closed, all strings are terminated, all braces/parentheses are matched, and the file ends with a valid export statement.
`;
        }

        if (warnings && warnings.length > 0) {
            prompt += `\nWARNINGS (fix if possible):
${warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}
`;
        }

        prompt += `\nCURRENT CODE:\n\`\`\`\n${code}\n\`\`\`\n`;

        // Add context of other files for import resolution
        if (contextFiles && Object.keys(contextFiles).length > 0) {
            const contextEntries = Object.entries(contextFiles)
                .filter(([p]) => p !== filePath)
                .slice(0, 6); // Limit context to 6 files

            if (contextEntries.length > 0) {
                prompt += `\nOTHER PROJECT FILES (for import/reference resolution):\n`;
                for (const [path, content] of contextEntries) {
                    const truncated = (content || '').substring(0, 800);
                    prompt += `--- ${path} ---\n${truncated}\n${content && content.length > 800 ? '// ... truncated\n' : ''}\n`;
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
