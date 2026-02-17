import fs from 'fs';
import path from 'path';
import { generateCompletion, CODE_GENERATOR_PROMPT } from './llm.js';
import { CodeValidator } from './validator.js';
import { RetryHandler } from './retry.js';
import { getTemplate } from './templates.js';
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console({ format: winston.format.simple() })]
});

/**
 * Service for project generation orchestration
 */
export class ProjectGenerationService {
    constructor(generatedDir) {
        this.generatedDir = generatedDir;
        this.validator = new CodeValidator();
        this.retryHandler = new RetryHandler();
    }

    /**
     * Generate a complete project
     * @param {Object} params - Generation parameters
     * @param {string} params.userPrompt - User's original prompt
     * @param {Object} params.requirements - Analyzed requirements
     * @param {Object} params.plan - Project plan with files
     * @param {Function} params.onProgress - Progress callback (message, progress, data)
     * @param {Function} params.onFileGenerated - File generated callback
     * @param {Function} params.onError - Error callback
     * @returns {Promise<Object>} Generation result
     */
    async generateProject({ userPrompt, requirements, plan, onProgress, onFileGenerated, onError }) {
        const startTime = Date.now();
        const projectId = `project_${this._hashString(userPrompt)}`;
        const projectDir = path.join(this.generatedDir, projectId);

        try {
            // Create project directory
            if (!fs.existsSync(projectDir)) {
                fs.mkdirSync(projectDir, { recursive: true });
            }

            onProgress?.('Starting generation...', 0);

            const files = plan.files || [];
            const totalFiles = files.length;

            if (totalFiles === 0) {
                throw new Error('No files in plan');
            }

            // Sort files (HTML first)
            const sortedFiles = this._sortFiles(files);

            // Generate each file
            for (let i = 0; i < totalFiles; i++) {
                if (i > 0) {
                    // Small delay between files
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                const fileInfo = sortedFiles[i];
                const filePath = typeof fileInfo === 'string' ? fileInfo : fileInfo.path;

                // Validate file path
                if (!this._isValidFilePath(filePath)) {
                    logger.warn(`Invalid file path skipped: ${filePath}`);
                    continue;
                }

                logger.info(`Generating file ${i + 1}/${totalFiles}: ${filePath}`);
                onProgress?.(
                    `Generating ${filePath}...`,
                    Math.floor((i / totalFiles) * 100),
                    { currentFile: filePath, fileIndex: i }
                );

                try {
                    const result = await this._generateFile({
                        filePath,
                        userPrompt,
                        requirements,
                        projectDir
                    });

                    onFileGenerated?.({
                        path: filePath,
                        content: result.code,
                        validation: {
                            is_valid: result.validation.isValid,
                            errors: result.validation.errors || [],
                            warnings: result.validation.warnings || [],
                            fixes_applied: result.validation.fixesApplied || []
                        }
                    });
                } catch (error) {
                    logger.error(`Error generating ${filePath}: ${error.message}`);
                    onError?.({
                        path: filePath,
                        error: error.message,
                        recoverable: true
                    });

                    // Use fallback template
                    try {
                        const fallbackCode = getTemplate(filePath, {
                            projectType: requirements.projectType,
                            title: 'My Website',
                            description: userPrompt.substring(0, 200)
                        });
                        const fullPath = path.join(projectDir, filePath);
                        const dirName = path.dirname(fullPath);
                        if (!fs.existsSync(dirName)) {
                            fs.mkdirSync(dirName, { recursive: true });
                        }
                        fs.writeFileSync(fullPath, fallbackCode);

                        onFileGenerated?.({
                            path: filePath,
                            content: fallbackCode,
                            validation: {
                                is_valid: true,
                                errors: [],
                                warnings: ['Using template fallback'],
                                fixes_applied: []
                            }
                        });
                    } catch (fallbackError) {
                        logger.error(`Fallback failed for ${filePath}: ${fallbackError.message}`);
                    }
                }
            }

            const duration = (Date.now() - startTime) / 1000;
            logger.info(`Generation complete in ${duration}s`);

            return {
                success: true,
                projectId,
                projectDir,
                downloadUrl: `/download/${projectId}`,
                duration,
                filesGenerated: totalFiles
            };

        } catch (error) {
            logger.error(`Project generation failed: ${error.message}`);
            throw new Error(`Project generation failed: ${error.message}`);
        }
    }

    /**
     * Generate a single file
     */
    async _generateFile({ filePath, userPrompt, requirements, projectDir }) {
        // Build generation prompt with all replacements
        const prompt = CODE_GENERATOR_PROMPT
            .replace(/{userPrompt}/g, userPrompt)
            .replace(/{projectType}/g, requirements.projectType || 'web-app')
            .replace(/{styling}/g, requirements.styling || 'modern')
            .replace(/{file_path}/g, filePath);

        // Generation function with timeout and error handling
        const generateFunc = async (p) => {
            try {
                const startTime = Date.now();
                logger.info(`LLM generation started for ${filePath}`);
                
                // Add timeout wrapper - race between generation and timeout
                const timeoutMs = 120000; // 2 minutes
                const result = await Promise.race([
                    generateCompletion(p, {
                        maxTokens: filePath.endsWith('.html') ? 1536 : 1024, // Reduce tokens for faster generation
                        temperature: 0.3
                    }),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error(`Generation timeout after ${timeoutMs}ms`)), timeoutMs)
                    )
                ]);

                const duration = Date.now() - startTime;
                logger.info(`LLM generation for ${filePath} completed in ${duration}ms`);

                const { code, error } = this._extractCodePayload(result, filePath, p);
                
                if (error || !code) {
                    return { code: this._cleanResponse(result, p), error: null };
                }

                return { code, error: null };
            } catch (e) {
                logger.warn(`Generation error for ${filePath}: ${e.message}`);
                return { code: null, error: e.message };
            }
        };

        // Try generation with retry
        const retryResult = await this.retryHandler.retryWithFeedback(
            generateFunc,
            prompt,
            filePath
        );

        let code;
        if (retryResult.success) {
            code = retryResult.code;
        } else {
            // Use template fallback
            logger.warn(`Generation failed for ${filePath}, using template fallback`);
            code = getTemplate(filePath, {
                projectType: requirements.projectType,
                title: 'My Website',
                description: userPrompt.substring(0, 200)
            });
        }

        // Validate and auto-fix
        const validationResult = this.validator.validateFile(code, filePath);
        
        if (validationResult.fixedCode) {
            code = validationResult.fixedCode;
            if (validationResult.fixesApplied && validationResult.fixesApplied.length > 0) {
                logger.info(`Auto-fixed ${filePath}: ${validationResult.fixesApplied.join(', ')}`);
            }
        }

        // Save file
        const fullPath = path.join(projectDir, filePath);
        const dirName = path.dirname(fullPath);
        if (!fs.existsSync(dirName)) {
            fs.mkdirSync(dirName, { recursive: true });
        }
        fs.writeFileSync(fullPath, code);

        return {
            code,
            validation: validationResult
        };
    }

    // Private helpers

    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash) % 10000;
    }

    _sortFiles(files) {
        return [...files].sort((a, b) => {
            const pathA = (a.path || a).toLowerCase();
            const pathB = (b.path || b).toLowerCase();
            if (pathA.includes('index.html')) return -1;
            if (pathB.includes('index.html')) return 1;
            if (pathA.endsWith('.html')) return -1;
            if (pathB.endsWith('.html')) return 1;
            if (pathA.endsWith('.css')) return -1;
            if (pathB.endsWith('.css')) return 1;
            return 0;
        });
    }

    _isValidFilePath(filePath) {
        return filePath && 
               !filePath.includes('..') && 
               !path.isAbsolute(filePath) &&
               filePath.length > 0;
    }

    _cleanResponse(response, prompt) {
        const normalized = this._normalize(response);
        if (!normalized) return '';
        let cleaned = normalized.trim();

        // Strip if response starts with the prompt
        if (prompt && cleaned.startsWith(prompt.trim().substring(0, 100))) {
            cleaned = cleaned.substring(prompt.trim().length).trim();
        }

        // Strip markdown headers that LLM uses (###, ##, #)
        cleaned = cleaned.replace(/^#{1,3}\s+\w+.*$/gm, '');

        // Aggressively strip everything before actual code starts
        // Look for the first occurrence of actual code markers
        const codeStartMarkers = [
            /<!DOCTYPE\s+html/i,
            /<html[\s>]/i,
            /^\/\*[\s\S]*?\*\//m,  // CSS comment at start
            /^body\s*\{/m,          // CSS body rule
            /^:root\s*\{/m,         // CSS variables
            /^\s*\*\s*\{/m,         // CSS reset
            /^(function|const|let|var|class|export|import)\s+/m,  // JS code
        ];

        for (const marker of codeStartMarkers) {
            const match = cleaned.match(marker);
            if (match && match.index > 0) {
                // Found code marker - strip everything before it
                cleaned = cleaned.substring(match.index);
                break;
            }
        }

        // Aggressively strip common prompt patterns that model echoes
        const promptPatterns = [
            /CONTEXT:[\s\S]*?(?=<!DOCTYPE|<html|\/\*|body\s*{|function|const|let|var|$)/i,
            /REQUIREMENTS:[\s\S]*?(?=<!DOCTYPE|<html|\/\*|body\s*{|function|const|let|var|$)/i,
            /MANDATORY CODE QUALITY STANDARDS:[\s\S]*?(?=<!DOCTYPE|<html|\/\*|body\s*{|function|const|let|var|$)/i,
            /SPECIFIC INSTRUCTIONS FOR[\s\S]*?(?=<!DOCTYPE|<html|\/\*|body\s*{|function|const|let|var|$)/i,
            /Generate complete, production-ready code[\s\S]*?(?=<!DOCTYPE|<html|\/\*|body\s*{|function|const|let|var|$)/i,
            /You are a senior full-stack developer[\s\S]*?(?=<!DOCTYPE|<html|\/\*|body\s*{|function|const|let|var|$)/i,
            /You are a junior developer[\s\S]*?(?=<!DOCTYPE|<html|\/\*|body\s*{|function|const|let|var|$)/i,
            /Project:.*?\|.*?Style:.*?\|.*?User wants:.*$/gm,
            /- no explanations.*$/gm,
            /For HTML:.*$/gm,
            /For CSS:.*$/gm,
            /For JavaScript:.*$/gm,
        ];

        for (const pattern of promptPatterns) {
            cleaned = cleaned.replace(pattern, '');
        }

        // Strip retry instruction
        cleaned = cleaned.replace(/\s*\[Retry:[^\]]*\]\s*/gi, '').trim();
        cleaned = cleaned.replace(/\s*Retry: output only the requested file content[^\n]*/gi, '').trim();

        const systemEchoes = [
            'You are a code generator. Output ONLY code.',
            'You are a code assistant. Output ONLY code.',
            'Generate ONLY the code',
            'Output ONLY the code',
            'NO explanations, NO markdown formatting',
            'no explanations, no markdown, no comments',
        ];

        for (const phrase of systemEchoes) {
            const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            cleaned = cleaned.replace(re, '').trim();
        }

        return cleaned;
    }

    _normalize(response) {
        if (response == null) return '';
        if (typeof response === 'string') return response;
        if (typeof response === 'object' && typeof response.text === 'string') return response.text;
        return String(response);
    }

    _extractCodePayload(response, filePath, prompt) {
        const cleanedResponse = this._cleanResponse(response, prompt);
        if (cleanedResponse.length === 0) {
            return { code: '', error: 'Empty response' };
        }

        let code = cleanedResponse;

        // Strip ### headers (Expert, Master, Legend, Architect, etc.) - LLM sometimes uses these
        code = code.replace(/^###\s+\w+\s*$/gm, '');
        code = code.replace(/^##\s+\w+\s*$/gm, '');
        code = code.replace(/^#\s+\w+\s*$/gm, '');

        // Extract from markdown code blocks
        const codeBlockPattern = /```(?:html|css|javascript|js|jsx|tsx|typescript|ts)?\s*\n?([\s\S]*?)```/gi;
        const matches = [...cleanedResponse.matchAll(codeBlockPattern)];

        if (matches.length > 0) {
            code = matches.map(m => m[1]).join('\n\n').trim();
        } else {
            // No code blocks found - try to extract actual code directly
            
            if (filePath.endsWith('.html')) {
                // For HTML, try to extract complete structure
                const htmlMatch = code.match(/<!DOCTYPE[\s\S]*?<\/html>/i) || 
                                 code.match(/<html[\s\S]*?<\/html>/i);
                if (htmlMatch) {
                    code = htmlMatch[0];
                } else {
                    // Try to find at least html tags and use what we have
                    const partialMatch = code.match(/<html[\s\S]*/i) || code.match(/<head[\s\S]*/i) || code.match(/<body[\s\S]*/i);
                    if (partialMatch) {
                        logger.warn(`Partial HTML structure for ${filePath}, validator will attempt to fix`);
                        code = partialMatch[0];
                    } else {
                        // Only reject if there's absolutely no HTML-like content
                        return { code: '', error: 'No HTML content found' };
                    }
                }
            } else if (filePath.endsWith('.css')) {
                // For CSS, accept any content with braces (CSS rules)
                if (code.includes('{') && code.includes('}')) {
                    // Has CSS-like content, let validator handle it
                } else {
                    logger.warn(`No CSS rules found for ${filePath}`);
                    return { code: '', error: 'No valid CSS found' };
                }
            } else if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
                // For JS, check for basic code keywords
                const hasJsCode = /\b(function|const|let|var|class|export|import|=>|if|for|while)\b/.test(code);
                if (!hasJsCode) {
                    logger.warn(`No JavaScript keywords found for ${filePath}`);
                    return { code: '', error: 'No valid JavaScript found' };
                }
            }
        }

        // Remove remaining triple backticks
        code = code.replace(/```/g, '');

        // Final check: if code still contains prompt-like content, strip it
        code = code.replace(/Generate complete, production-ready code[\s\S]*?(?=<!DOCTYPE|<html|\/\*|body\s*{|function|const|let|var)/i, '');

        return { code: code.trim(), error: null };
    }
}
