import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { generateCompletionStream, buildCodeGenPrompt, getMaxTokens } from './llm.js';
import { CodeValidator } from './validator.js';
import { RetryHandler } from './retry.js';
import { getTemplate } from './templates.js';
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console({ format: winston.format.simple() })]
});

// ─── Total generation timeout (5 minutes) ───────────────────────────────────
const MAX_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Service for project generation orchestration with streaming
 */
export class ProjectGenerationService {
    constructor(generatedDir) {
        this.generatedDir = generatedDir;
        this.validator = new CodeValidator();
        this.retryHandler = new RetryHandler();
    }

    /**
     * Generate a complete project with streaming support
     */
    async generateProject({ userPrompt, requirements, plan, onProgress, onFileGenerated, onFileChunk, onError, onPlan }) {
        const startTime = Date.now();
        const projectId = `project_${crypto.randomUUID().split('-')[0]}`;
        const projectDir = path.join(this.generatedDir, projectId);

        // Guard: total generation timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Total generation timeout exceeded (5 minutes)')), MAX_GENERATION_TIMEOUT_MS);
        });

        try {
            if (!fs.existsSync(projectDir)) {
                fs.mkdirSync(projectDir, { recursive: true });
            }

            const files = plan.files || [];
            const totalFiles = files.length;

            if (totalFiles === 0) {
                throw new Error('No files in plan');
            }

            // Emit the plan to frontend so it can render the file tree immediately
            onPlan?.({
                files: files.map(f => ({ path: f.path, purpose: f.purpose })),
                techStack: plan.techStack || [],
                framework: requirements.framework || 'vanilla-js',
                stylingFramework: requirements.stylingFramework || 'plain-css'
            });

            // Sort files: config first, then HTML/layout, then styles, then scripts
            const sortedFiles = this._sortFiles(files, requirements.framework);

            onProgress?.('Starting generation...', 0);

            // Track generated files for inter-file context
            const generatedFiles = {};
            let filesCompleted = 0;

            // Identify files that can be generated concurrently (independent files)
            const { sequential, concurrent } = this._classifyDependencies(sortedFiles, requirements.framework);

            // Generate sequential files first (entry points, configs)
            for (const fileInfo of sequential) {
                await Promise.race([
                    this._generateSingleFile({
                        fileInfo,
                        userPrompt,
                        requirements,
                        projectDir,
                        generatedFiles,
                        totalFiles,
                        filesCompleted,
                        onProgress,
                        onFileGenerated,
                        onFileChunk,
                        onError
                    }),
                    timeoutPromise
                ]);

                filesCompleted++;
            }

            // Generate concurrent files in parallel (batch of 3)
            const batchSize = 3;
            for (let i = 0; i < concurrent.length; i += batchSize) {
                const batch = concurrent.slice(i, i + batchSize);

                await Promise.race([
                    Promise.all(batch.map(fileInfo =>
                        this._generateSingleFile({
                            fileInfo,
                            userPrompt,
                            requirements,
                            projectDir,
                            generatedFiles,
                            totalFiles,
                            filesCompleted: filesCompleted + i,
                            onProgress,
                            onFileGenerated,
                            onFileChunk,
                            onError
                        })
                    )),
                    timeoutPromise
                ]);

                filesCompleted += batch.length;
            }

            const duration = (Date.now() - startTime) / 1000;
            logger.info(`Generation complete in ${duration}s — ${totalFiles} files`);

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
     * Generate a single file (with streaming, retry, validation)
     */
    async _generateSingleFile({ fileInfo, userPrompt, requirements, projectDir, generatedFiles, totalFiles, filesCompleted, onProgress, onFileGenerated, onFileChunk, onError }) {
        const filePath = typeof fileInfo === 'string' ? fileInfo : fileInfo.path;

        if (!this._isValidFilePath(filePath)) {
            logger.warn(`Invalid file path skipped: ${filePath}`);
            return;
        }

        logger.info(`Generating: ${filePath}`);
        onProgress?.(
            `Generating ${filePath}...`,
            Math.floor((filesCompleted / totalFiles) * 100),
            { currentFile: filePath, fileIndex: filesCompleted }
        );

        try {
            const result = await this._generateFile({
                filePath,
                userPrompt,
                requirements,
                projectDir,
                generatedFiles,
                onFileChunk
            });

            // Track for inter-file context
            generatedFiles[filePath] = result.code;

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
            onError?.({ path: filePath, error: error.message, recoverable: true });

            // Fallback to template
            try {
                const fallbackCode = getTemplate(filePath, {
                    projectType: requirements.projectType,
                    framework: requirements.framework,
                    stylingFramework: requirements.stylingFramework,
                    title: 'My Website',
                    description: userPrompt.substring(0, 200)
                });

                this._writeFile(projectDir, filePath, fallbackCode);
                generatedFiles[filePath] = fallbackCode;

                onFileGenerated?.({
                    path: filePath,
                    content: fallbackCode,
                    validation: {
                        is_valid: true,
                        errors: [],
                        warnings: ['Using template fallback due to generation error'],
                        fixes_applied: []
                    }
                });
            } catch (fallbackError) {
                logger.error(`Fallback failed for ${filePath}: ${fallbackError.message}`);
            }
        }
    }

    /**
     * Generate a single file with streaming
     */
    async _generateFile({ filePath, userPrompt, requirements, projectDir, generatedFiles, onFileChunk }) {
        const prompt = buildCodeGenPrompt({
            filePath,
            framework: requirements.framework || 'vanilla-js',
            projectType: requirements.projectType || 'web-app',
            styling: requirements.styling || 'modern',
            stylingFramework: requirements.stylingFramework || 'plain-css',
            userPrompt,
            generatedFiles
        });

        const maxTokens = getMaxTokens(filePath, requirements.complexity);

        const generateFunc = async (p) => {
            try {
                const startTime = Date.now();
                const timeoutMs = 120_000; // 2 minutes per file

                let fullText = '';
                const streamPromise = generateCompletionStream(
                    p,
                    {
                        maxTokens,
                        temperature: 0.2,
                        systemPrompt: "You are an expert full-stack developer. Output ONLY raw code for the requested file. No explanations, no markdown code fences, no conversational text."
                    },
                    (chunk, accumulated) => {
                        fullText = accumulated;
                        // Emit streaming chunks to frontend
                        onFileChunk?.({ path: filePath, chunk, accumulated });
                    }
                );

                const result = await Promise.race([
                    streamPromise,
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`File generation timeout after ${timeoutMs}ms`)), timeoutMs)
                    )
                ]);

                const duration = Date.now() - startTime;
                logger.info(`LLM generation for ${filePath} completed in ${duration}ms (${(fullText || result || '').length} chars)`);

                const code = fullText || result || '';
                const { code: extractedCode, error } = this._extractCodePayload(code, filePath, p);

                if (error || !extractedCode) {
                    return { code: this._cleanResponse(code, p), error: null };
                }

                return { code: extractedCode, error: null };
            } catch (e) {
                logger.warn(`Generation error for ${filePath}: ${e.message}`);
                return { code: null, error: e.message };
            }
        };

        // Retry with feedback
        const retryResult = await this.retryHandler.retryWithFeedback(generateFunc, prompt, filePath);

        let code;
        if (retryResult.success) {
            code = retryResult.code;
        } else {
            logger.warn(`All retries failed for ${filePath}, using template fallback`);
            code = getTemplate(filePath, {
                projectType: requirements.projectType,
                framework: requirements.framework,
                stylingFramework: requirements.stylingFramework,
                title: 'My Website',
                description: userPrompt.substring(0, 200)
            });
        }

        // Validate and auto-fix
        const validationResult = this.validator.validateFile(code, filePath);

        if (validationResult.fixedCode) {
            code = validationResult.fixedCode;
            if (validationResult.fixesApplied?.length > 0) {
                logger.info(`Auto-fixed ${filePath}: ${validationResult.fixesApplied.join(', ')}`);
            }
        }

        // Write to disk
        this._writeFile(projectDir, filePath, code);

        return { code, validation: validationResult };
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    _writeFile(projectDir, filePath, code) {
        const fullPath = path.join(projectDir, filePath);
        const dirName = path.dirname(fullPath);
        if (!fs.existsSync(dirName)) {
            fs.mkdirSync(dirName, { recursive: true });
        }
        fs.writeFileSync(fullPath, code);
    }

    /**
     * Sort files: config files first, then entry points, then styles, then components
     */
    _sortFiles(files, framework) {
        const priority = (f) => {
            const p = (f.path || f).toLowerCase();
            // Config files first
            if (p === 'package.json') return 0;
            if (p.includes('config') || p.includes('tsconfig')) return 1;
            // Entry points
            if (p.includes('index.html') || p.includes('layout.tsx') || p.includes('layout.astro')) return 2;
            if (p.includes('main.') || p.includes('index.')) return 3;
            // Root app
            if (p.includes('app.')) return 4;
            // Styles
            if (p.endsWith('.css') || p.endsWith('.scss')) return 5;
            // Components
            return 6;
        };

        return [...files].sort((a, b) => priority(a) - priority(b));
    }

    /**
     * Classify files into sequential (must be first) and concurrent (can parallelize)
     */
    _classifyDependencies(sortedFiles, framework) {
        const sequential = [];
        const concurrent = [];

        for (const f of sortedFiles) {
            const p = (f.path || f).toLowerCase();
            // Config and entry points must be sequential (they provide context)
            if (p === 'package.json' ||
                p.includes('config') ||
                p.includes('tsconfig') ||
                p.includes('index.html') ||
                p.includes('layout.tsx') ||
                p.includes('layout.astro') ||
                p.includes('main.') ||
                p.includes('app.')) {
                sequential.push(f);
            } else {
                concurrent.push(f);
            }
        }

        return { sequential, concurrent };
    }

    _isValidFilePath(filePath) {
        return filePath &&
            !filePath.includes('..') &&
            !path.isAbsolute(filePath) &&
            filePath.length > 0 &&
            filePath.length < 256;
    }

    _cleanResponse(response, prompt) {
        const normalized = typeof response === 'string' ? response : String(response || '');
        if (!normalized) return '';
        let cleaned = normalized.trim();

        // Strip if response echoes prompt
        if (prompt && cleaned.startsWith(prompt.trim().substring(0, 100))) {
            cleaned = cleaned.substring(prompt.trim().length).trim();
        }

        // Strip markdown headers
        cleaned = cleaned.replace(/^#{1,3}\s+\w+.*$/gm, '');

        // Find code start markers
        const codeStartMarkers = [
            /<!DOCTYPE\s+html/i,
            /<html[\s>]/i,
            /<template[\s>]/i,      // Vue/Svelte templates
            /<script[\s>]/i,        // Svelte/Astro
            /^---\n/m,              // Astro frontmatter
            /^\/\*[\s\S]*?\*\//m,
            /^body\s*\{/m,
            /^:root\s*\{/m,
            /^\s*\*\s*\{/m,
            /^@tailwind/m,
            /^(function|const|let|var|class|export|import)\s+/m,
            /^(import|from)\s+/m,
            /^{/m,                  // JSON files
        ];

        for (const marker of codeStartMarkers) {
            const match = cleaned.match(marker);
            if (match && match.index > 0) {
                cleaned = cleaned.substring(match.index);
                break;
            }
        }

        // Strip system prompt echoes
        const systemEchoes = [
            'You are a code generator. Output ONLY code.',
            'You are an expert full-stack developer.',
            'Output ONLY the code',
            'NO explanations, NO markdown formatting',
            'no explanations, no markdown, no comments',
        ];

        for (const phrase of systemEchoes) {
            const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            cleaned = cleaned.replace(re, '').trim();
        }

        // Strip retry instructions
        cleaned = cleaned.replace(/\s*\[Retry:[^\]]*\]\s*/gi, '').trim();

        return cleaned;
    }

    _extractCodePayload(response, filePath, prompt) {
        const cleanedResponse = this._cleanResponse(response, prompt);
        if (cleanedResponse.length === 0) {
            return { code: '', error: 'Empty response' };
        }

        let code = cleanedResponse;

        // Extract from markdown code blocks if present
        const codeBlockPattern = /```(?:html|css|javascript|js|jsx|tsx|typescript|ts|vue|svelte|astro|json|scss|yaml)?\s*\n?([\s\S]*?)```/gi;
        const matches = [...cleanedResponse.matchAll(codeBlockPattern)];

        if (matches.length > 0) {
            code = matches.map(m => m[1]).join('\n\n').trim();
        } else {
            // Framework-specific extraction
            const ext = filePath.split('.').pop()?.toLowerCase();

            if (ext === 'html') {
                const htmlMatch = code.match(/<!DOCTYPE[\s\S]*?<\/html>/i) ||
                    code.match(/<html[\s\S]*?<\/html>/i);
                if (htmlMatch) code = htmlMatch[0];
            } else if (ext === 'vue') {
                // Vue SFC: must have <template> or <script>
                const vueMatch = code.match(/<(?:template|script)[\s\S]*/i);
                if (vueMatch) code = vueMatch[0];
            } else if (ext === 'svelte') {
                const svelteMatch = code.match(/<(?:script|style|div|section|main|h1|p|nav)[\s\S]*/i);
                if (svelteMatch) code = svelteMatch[0];
            } else if (ext === 'astro') {
                const astroMatch = code.match(/---[\s\S]*?---[\s\S]*/m) ||
                    code.match(/<(?:Layout|html|div|section)[\s\S]*/i);
                if (astroMatch) code = astroMatch[0];
            } else if (ext === 'json') {
                const jsonMatch = code.match(/\{[\s\S]*\}/);
                if (jsonMatch) code = jsonMatch[0];
            } else if (ext === 'css' || ext === 'scss') {
                if (!code.includes('{')) return { code: '', error: 'No CSS rules found' };
            } else if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext)) {
                const hasCode = /\b(function|const|let|var|class|export|import|=>|if|for|while|module|require)\b/.test(code);
                if (!hasCode) return { code: '', error: 'No valid code found' };
            }
        }

        // Remove leftover triple backticks
        code = code.replace(/```/g, '');

        return { code: code.trim(), error: null };
    }
}
