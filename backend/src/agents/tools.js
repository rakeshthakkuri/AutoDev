// ═══════════════════════════════════════════════════════════════════════════════
// Generation Tools — discrete actions the orchestrator can invoke
// Each tool: (state, params) => Promise<{ success, result?, error?, stateDelta? }>
// ═══════════════════════════════════════════════════════════════════════════════

import config from '../config.js';

/**
 * Registry of tools the generation agent can use.
 * Tools receive current state and params, return result and optional state updates.
 */
export const TOOL_NAMES = {
    GENERATE_FILE: 'generate_file',
    FIX_FILE: 'fix_file',
    VALIDATE_PROJECT: 'validate_project',
    FIX_CROSS_FILE: 'fix_cross_file',
    WRITE_FILE: 'write_file',
};

/**
 * @typedef {Object} ToolResult
 * @property {boolean} success
 * @property {object} [result] - Tool-specific result
 * @property {string} [error]
 * @property {object} [stateDelta] - Partial state to merge (e.g. { phase, sequentialIndex })
 */

/**
 * Creates a tools executor that delegates to ProjectGenerationService internals.
 * Used by the orchestrator to run the agent loop.
 *
 * @param {import('../services/projectGeneration.js').ProjectGenerationService} service
 * @returns {{ execute(toolName: string, state: object, params: object): Promise<ToolResult> }}
 */
export function createGenerationTools(service) {
    return {
        /**
         * @param {string} toolName - One of TOOL_NAMES
         * @param {object} state - Mutable state (plan, requirements, generatedFiles, projectDir, callbacks, etc.)
         * @param {object} params - Tool-specific params (e.g. { fileInfo }, { filePath, code, errors })
         * @returns {Promise<ToolResult>}
         */
        async execute(toolName, state, params = {}) {
            switch (toolName) {
                case TOOL_NAMES.GENERATE_FILE:
                    return this._toolGenerateFile(state, params);
                case TOOL_NAMES.FIX_FILE:
                    return this._toolFixFile(state, params);
                case TOOL_NAMES.VALIDATE_PROJECT:
                    return this._toolValidateProject(state);
                case TOOL_NAMES.FIX_CROSS_FILE:
                    return this._toolFixCrossFile(state, params);
                case TOOL_NAMES.WRITE_FILE:
                    return this._toolWriteFile(state, params);
                default:
                    return { success: false, error: `Unknown tool: ${toolName}` };
            }
        },

        async _toolGenerateFile(state, { fileInfo }) {
            if (!fileInfo || !state.projectDir) {
                return { success: false, error: 'Missing fileInfo or projectDir' };
            }
            const totalFiles = (state.sortedFiles || []).length;
            const filesCompleted = (state.filesCompleted ?? 0);

            try {
                await service._generateSingleFile({
                    fileInfo,
                    userPrompt: state.userPrompt,
                    requirements: state.requirements,
                    plan: state.plan,
                    projectDir: state.projectDir,
                    generatedFiles: state.generatedFiles,
                    totalFiles,
                    filesCompleted,
                    onProgress: state.callbacks?.onProgress,
                    onFileGenerated: state.callbacks?.onFileGenerated,
                    onFileChunk: state.callbacks?.onFileChunk,
                    onError: state.callbacks?.onError,
                    onFileFixing: state.callbacks?.onFileFixing,
                    onFileFixed: state.callbacks?.onFileFixed,
                });
                return {
                    success: true,
                    result: { filePath: typeof fileInfo === 'string' ? fileInfo : fileInfo?.path },
                    stateDelta: { filesCompleted: filesCompleted + 1 },
                };
            } catch (err) {
                return {
                    success: false,
                    error: err.message,
                    stateDelta: { lastError: err.message },
                };
            }
        },

        async _toolFixFile(state, { filePath, code, errors, warnings }) {
            if (!filePath || !state.projectDir) {
                return { success: false, error: 'Missing filePath or projectDir' };
            }
            try {
                const fixResult = await service.agentFixer.fixFileWithFeedback({
                    code: code || state.generatedFiles[filePath],
                    filePath,
                    errors: errors || [],
                    warnings: warnings || [],
                    userPrompt: state.userPrompt,
                    contextFiles: state.generatedFiles,
                    importingFiles: undefined,
                    onFixAttempt: state.callbacks?.onFileFixing,
                });
                const finalCode = fixResult.validation?.fixedCode || fixResult.code;
                // Return as a stateDelta instead of mutating state directly
                service._writeFile(state.projectDir, filePath, finalCode);
                state.callbacks?.onFileFixed?.({
                    path: filePath,
                    content: finalCode,
                    validation: fixResult.validation,
                });
                return {
                    success: true,
                    result: { filePath, fixed: fixResult.fixed, validation: fixResult.validation },
                    stateDelta: { generatedFiles: { ...state.generatedFiles, [filePath]: finalCode } },
                };
            } catch (err) {
                return { success: false, error: err.message };
            }
        },

        async _toolValidateProject(state) {
            const framework = state.requirements?.framework || config.defaultFramework;
            const structureResult = service.validator.validateProjectStructure(state.generatedFiles, framework);
            return {
                success: true,
                result: {
                    isValid: structureResult.isValid,
                    warnings: structureResult.warnings || [],
                },
                stateDelta: {
                    structureWarnings: structureResult.warnings || [],
                    reviewValidated: true,
                },
            };
        },

        async _toolFixCrossFile(state, params) {
            const warnings = state.structureWarnings || params.warnings || [];
            if (warnings.length === 0) {
                return { success: true, result: { fixedCount: 0 } };
            }
            try {
                const fixedFiles = await service.agentFixer.fixCrossFileIssues({
                    files: state.generatedFiles,
                    structureErrors: warnings,
                    userPrompt: state.userPrompt,
                    framework: state.requirements?.framework || config.defaultFramework,
                    onFixAttempt: state.callbacks?.onFileFixing,
                });
                const updatedFiles = { ...state.generatedFiles };
                for (const [filePath, { code, validation }] of Object.entries(fixedFiles)) {
                    updatedFiles[filePath] = code;
                    service._writeFile(state.projectDir, filePath, code);
                    state.callbacks?.onFileFixed?.({
                        path: filePath,
                        content: code,
                        validation: { is_valid: validation.isValid, errors: validation.errors, warnings: validation.warnings, fixes_applied: [...(validation.fixesApplied || []), 'Cross-file agent fix'] },
                    });
                    state.callbacks?.onFileGenerated?.({
                        path: filePath,
                        content: code,
                        validation,
                    });
                }
                return {
                    success: true,
                    result: { fixedCount: Object.keys(fixedFiles).length },
                    stateDelta: { structureWarnings: [], generatedFiles: updatedFiles },
                };
            } catch (err) {
                return { success: false, error: err.message };
            }
        },

        async _toolWriteFile(state, { filePath, content }) {
            if (!filePath || content == null || !state.projectDir) {
                return { success: false, error: 'Missing filePath, content, or projectDir' };
            }
            try {
                service._writeFile(state.projectDir, filePath, content);
                return {
                    success: true,
                    result: { filePath },
                    stateDelta: { generatedFiles: { ...state.generatedFiles, [filePath]: content } },
                };
            } catch (err) {
                return { success: false, error: err.message };
            }
        },
    };
}
