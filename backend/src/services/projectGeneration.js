import path from 'path';
import crypto from 'crypto';
import config from '../config.js';
import logger from './logger.js';
import { generateCompletionStream, buildCodeGenPrompt } from './llm.js';
import { CodeValidator } from './validator.js';
import { RetryHandler } from './retry.js';
import { AgentFixer } from './agentFixer.js';
import { getTemplate } from './templates.js';
import { runGenerationGraphV2 } from '../agents/orchestrator/graph.js';
import { bundleProject } from './bundler.js';

const { maxTotalTimeout: MAX_GENERATION_TIMEOUT_MS, maxFileTimeout } = config.generation;

async function collectProjectFiles(storage, projectId) {
    const rels = await storage.listFiles(projectId);
    const out = {};
    for (const rel of rels) {
        out[rel] = await storage.readFile(projectId, rel);
    }
    return out;
}

async function probeBundleSuccess(storage, projectId) {
    try {
        const files = await collectProjectFiles(storage, projectId);
        if (Object.keys(files).length === 0) return false;
        bundleProject(files);
        return true;
    } catch {
        return false;
    }
}

/**
 * Build payload for metrics route `recordGeneration` (duration in ms).
 */
async function buildMetricsRecord({
    generationId,
    userPrompt,
    framework,
    planFileCount,
    result,
    storage,
    projectId,
    durationMs,
}) {
    const fg = result.filesGenerated ?? 0;
    const quality = result.quality
        || (result.success ? 'full' : result.partialSuccess ? 'partial' : 'failed');
    const llmCalls = result.metrics?.llmCalls ?? 0;
    const filesFailed = result.metrics?.filesFailed ?? 0;
    const filesClean = Math.max(0, fg - filesFailed);

    const shouldProbeBundle = result.success || result.partialSuccess;
    const bundleSuccess = shouldProbeBundle ? await probeBundleSuccess(storage, projectId) : false;

    const vr = result.metrics?.validationResult;
    const initialImp = vr?.initialIssues ?? 0;
    const remainingImp = vr?.remainingIssues ?? 0;

    return {
        generationId,
        agentVersion: 'v2',
        prompt: userPrompt,
        framework: framework || config.defaultFramework,
        quality,
        duration: durationMs,
        fileCount: planFileCount,
        filesClean,
        filesFailed,
        llmCalls,
        bundleSuccess,
        errors: [],
        validationErrors: initialImp,
        remainingErrors: remainingImp,
        missingPackages: vr?.missingPackages?.length ?? 0,
        repairPassesNeeded: initialImp > 0 ? 1 : 0,
        fullyValidated: remainingImp === 0,
    };
}

/**
 * Service for project generation orchestration with streaming
 */
export class ProjectGenerationService {
    /**
     * @param {string} generatedDir - Legacy base path (used when storage not injected; prefer storage)
     * @param {import('./storage/StorageService.js').StorageService} [storage]
     */
    constructor(generatedDir, storage = null) {
        this.generatedDir = generatedDir;
        this.storage = storage;
        this.validator = new CodeValidator();
        this.retryHandler = new RetryHandler();
        this.agentFixer = new AgentFixer(this.validator);
    }

    /**
     * Generate a complete project with streaming support (agentic orchestration).
     * Uses an orchestrator that runs a state machine and invokes tools (generate_file, validate_project, fix_cross_file).
     */
    async generateProject({ generationId: passedGenerationId, userPrompt, requirements, plan, onProgress, onFileGenerated, onFileChunk, onError, onPlan, onFileFixing, onFileFixed }) {
        const startTime = Date.now();
        const generationId = passedGenerationId || crypto.randomUUID();
        const projectId = `project_${crypto.randomUUID().split('-')[0]}`;

        try {
            if (!this.storage) {
                throw new Error('ProjectGenerationService requires a StorageService instance');
            }

            await this.storage.ensureProject(projectId);
            const projectDir = this.storage.getProjectDir(projectId);

            const files = plan?.files || [];
            if (!Array.isArray(files) || files.length === 0) {
                throw new Error('No files in plan. Please try generating again or use a different prompt.');
            }

            const effectiveRequirements = this._sanitizeRequirements(requirements || {});
            logger.info('Generation started', {
                generationId,
                projectId,
                fileCount: files.length,
                framework: effectiveRequirements.framework,
                stylingFramework: effectiveRequirements.stylingFramework
            });

            const callbacks = {
                onProgress,
                onFileGenerated,
                onFileChunk,
                onError,
                onPlan,
                onFileFixing,
                onFileFixed,
            };

            logger.info('Using v2 multi-agent pipeline', { generationId });

            const result = await runGenerationGraphV2(
                {
                    analysisService: this._analysisService,
                    generationService: this,
                    validator: this.validator,
                    agentFixer: this.agentFixer,
                },
                { generationId, userPrompt, requirements: effectiveRequirements, plan, projectDir, callbacks }
            );

            const durationMs = Date.now() - startTime;
            const duration = durationMs / 1000;

            const metricsRecord = await buildMetricsRecord({
                generationId,
                userPrompt,
                framework: effectiveRequirements.framework,
                planFileCount: files.length,
                result,
                storage: this.storage,
                projectId,
                durationMs,
            });

            if (!result.success) {
                const err = new Error(result.error || 'Generation completed with issues');
                err.generationResult = result;
                err.metricsRecord = metricsRecord;
                throw err;
            }

            logger.info(`Generation complete in ${duration}s — ${result.filesGenerated} files, ${result.stepsUsed} agent steps`);

            return {
                success: true,
                projectId,
                projectDir,
                downloadUrl: `/download/${projectId}`,
                duration,
                filesGenerated: result.filesGenerated ?? files.length,
                metricsRecord,
            };
        } catch (error) {
            logger.error(`Project generation failed: ${error.message}`);
            const wrapped = new Error(`Project generation failed: ${error.message}`);
            if (error.generationResult) wrapped.generationResult = error.generationResult;
            if (error.metricsRecord) wrapped.metricsRecord = error.metricsRecord;
            throw wrapped;
        }
    }

    /**
     * Generate a single file (with streaming, retry, validation)
     */
    async _generateSingleFile({ fileInfo, userPrompt, requirements, plan, projectDir, generatedFiles, totalFiles, filesCompleted, onProgress, onFileGenerated, onFileChunk, onError, onFileFixing, onFileFixed, _contextBuilder, _tokenBudget, _promptOverride }) {
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
                onFileChunk,
                planFiles: plan?.files || [],
                _promptOverride,
            });

            let finalCode = result.code;
            let finalValidation = result.validation;

            // ── Agentic fix loop: if validation failed, use LLM to fix errors ──
            if (!finalValidation.isValid && finalValidation.errors && finalValidation.errors.length > 0) {
                logger.info(`Validation failed for ${filePath} (${finalValidation.errors.length} errors) — starting agent fix`);

                const framework = requirements.framework || config.defaultFramework;
                const fixResult = await this.agentFixer.fixFileWithFeedback({
                    code: finalCode,
                    filePath,
                    errors: finalValidation.errors,
                    warnings: finalValidation.warnings || [],
                    userPrompt,
                    contextFiles: generatedFiles,
                    framework,
                    onFixAttempt: (data) => {
                        onFileFixing?.(data);
                    },
                });

                finalCode = fixResult.code;
                finalValidation = fixResult.validation;

                // Write the fixed version to disk
                await this._writeFile(projectDir, filePath, finalCode);

                if (fixResult.fixed) {
                    logger.info(`Agent fix succeeded for ${filePath} in ${fixResult.attempts} attempt(s)`);
                    onFileFixed?.({
                        path: filePath,
                        content: finalCode,
                        validation: {
                            is_valid: finalValidation.isValid,
                            errors: finalValidation.errors || [],
                            warnings: finalValidation.warnings || [],
                            fixes_applied: [...(finalValidation.fixesApplied || []), `Agent fix (${fixResult.attempts} attempt(s))`]
                        }
                    });
                }
            }

            let forcedFallback = false;
            let forcedFallbackReason = '';

            // Hard safety net for ALL file types:
            // 1) If still invalid after repair, run one strict full-file recovery generation.
            // 2) If still invalid, force deterministic template fallback.
            if (!finalValidation.isValid) {
                logger.warn(`File ${filePath} still invalid after fixes; attempting strict recovery generation`);
                const recoveryResult = await this._generateFile({
                    filePath,
                    userPrompt: `${userPrompt}\n\nRECOVERY MODE: Previous output for ${filePath} was invalid/truncated. Return a complete, valid file only with balanced syntax and no partial blocks.`,
                    requirements,
                    projectDir,
                    generatedFiles,
                    onFileChunk,
                    planFiles: plan?.files || []
                });
                finalCode = recoveryResult.code;
                finalValidation = recoveryResult.validation;
            }

            if (!finalValidation.isValid) {
                logger.warn(`File ${filePath} still invalid after recovery; forcing template fallback`);
                const framework = requirements.framework || config.defaultFramework;
                const safeCode = getTemplate(filePath, {
                    projectType: requirements.projectType,
                    framework,
                    stylingFramework: requirements.stylingFramework,
                    title: 'My Website',
                    description: userPrompt.substring(0, 200)
                });

                const safeValidation = this.validator.validateFile(safeCode, filePath, framework);
                finalCode = safeValidation.fixedCode || safeCode;
                finalValidation = {
                    ...safeValidation,
                    warnings: [
                        ...(safeValidation.warnings || []),
                        'Generation output was invalid after repair/recovery; template fallback used'
                    ]
                };
                await this._writeFile(projectDir, filePath, finalCode);
                forcedFallback = true;
                forcedFallbackReason = 'Invalid after repair and recovery; template fallback used';
            }

            // Track for inter-file context
            generatedFiles[filePath] = finalCode;

            const filePayload = {
                path: filePath,
                content: finalCode,
                validation: {
                    is_valid: finalValidation.isValid,
                    errors: finalValidation.errors || [],
                    warnings: finalValidation.warnings || [],
                    fixes_applied: finalValidation.fixesApplied || []
                }
            };
            if (result.fallback) {
                filePayload.fallback = true;
                filePayload.fallbackReason = result.fallbackReason;
            }
            if (forcedFallback) {
                filePayload.fallback = true;
                filePayload.fallbackReason = forcedFallbackReason;
            }
            onFileGenerated?.(filePayload);
        } catch (error) {
            logger.error(`Error generating ${filePath}: ${error.message}`);
            onError?.({ path: filePath, error: error.message, recoverable: true });

            // Fallback to template (absolute last resort)
            try {
                const fallbackCode = getTemplate(filePath, {
                    projectType: requirements.projectType,
                    framework: requirements.framework,
                    stylingFramework: requirements.stylingFramework,
                    title: 'My Website',
                    description: userPrompt.substring(0, 200)
                });

                await this._writeFile(projectDir, filePath, fallbackCode);
                generatedFiles[filePath] = fallbackCode;

                onFileGenerated?.({
                    path: filePath,
                    content: fallbackCode,
                    validation: {
                        is_valid: true,
                        errors: [],
                        warnings: ['Using template fallback due to generation error'],
                        fixes_applied: []
                    },
                    fallback: true,
                    fallbackReason: 'LLM generation failed; template used as fallback'
                });
            } catch (fallbackError) {
                logger.error(`Fallback failed for ${filePath}: ${fallbackError.message}`);
            }
        }
    }

    /**
     * Generate a single file with streaming
     */
    async _generateFile({ filePath, userPrompt, requirements, projectDir, generatedFiles, onFileChunk, planFiles, _promptOverride }) {
        const prompt = _promptOverride || buildCodeGenPrompt({
            filePath,
            framework: requirements.framework || config.defaultFramework,
            projectType: requirements.projectType || 'web-app',
            styling: requirements.styling || 'modern',
            stylingFramework: requirements.stylingFramework || 'plain-css',
            userPrompt,
            generatedFiles,
            planFiles: planFiles || []
        });

        const generateFunc = async (p) => {
            try {
                const startTime = Date.now();
                const timeoutMs = maxFileTimeout;

                let fullText = '';
                const streamPromise = generateCompletionStream(
                    p,
                    {
                        temperature: 0.2,
                        systemPrompt: "You are a professional code generator. Output ONLY raw code for the requested file. NO explanations, NO markdown code fences, NO conversational text, NO backticks around URLs or attributes."
                    },
                    (chunk, accumulated) => {
                        fullText = accumulated;
                        // Emit only the delta chunk to frontend (client accumulates)
                        onFileChunk?.({ path: filePath, chunk });
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
        let fallback = false;
        let fallbackReason = '';
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
            fallback = true;
            fallbackReason = `LLM generation failed after ${config.generation.maxRetries} retries`;
        }

        // Validate and auto-fix
        const framework = requirements.framework || config.defaultFramework;
        const validationResult = this.validator.validateFile(code, filePath, framework);

        if (validationResult.fixedCode) {
            code = validationResult.fixedCode;
            if (validationResult.fixesApplied?.length > 0) {
                logger.info(`Auto-fixed ${filePath}: ${validationResult.fixesApplied.join(', ')}`);
            }
        }

        // Write to disk
        await this._writeFile(projectDir, filePath, code);

        return { code, validation: validationResult, fallback, fallbackReason };
    }

    /**
     * Post-generation review: validate all files together and fix cross-file issues
     */
    async _postGenerationReview({ generatedFiles, requirements, userPrompt, projectDir, onFileFixed, onFileFixing, onFileGenerated }) {
        try {
            // 1. Sync package.json with actually used libraries
            await this._syncPackageJson(generatedFiles, projectDir, onFileGenerated);

            const framework = requirements.framework || config.defaultFramework;
            const structureResult = this.validator.validateProjectStructure(generatedFiles, framework);
            
            // 2. Detect circular dependencies
            const cycles = this._detectCircularDependencies(generatedFiles);
            if (cycles.length > 0) {
                cycles.forEach(cycle => {
                    structureResult.warnings.push(`Circular dependency detected: ${cycle.join(' -> ')}`);
                });
                structureResult.isValid = false;
            }

            if (structureResult.isValid && structureResult.warnings.length === 0) {
                logger.info('Post-generation review: all cross-file checks passed');
                return;
            }

            logger.info(`Post-generation review: ${structureResult.warnings.length} cross-file issue(s) found`);

            const fixedFiles = await this.agentFixer.fixCrossFileIssues({
                files: generatedFiles,
                structureErrors: structureResult.warnings,
                userPrompt,
                framework,
                onFixAttempt: (data) => {
                    onFileFixing?.(data);
                },
            });

            // Emit updated files
            for (const [filePath, { code, validation }] of Object.entries(fixedFiles)) {
                // Update in-memory files
                generatedFiles[filePath] = code;

                // Write to disk
                await this._writeFile(projectDir, filePath, code);

                // Notify frontend
                onFileFixed?.({
                    path: filePath,
                    content: code,
                    validation: {
                        is_valid: validation.isValid,
                        errors: validation.errors || [],
                        warnings: validation.warnings || [],
                        fixes_applied: [...(validation.fixesApplied || []), 'Cross-file agent fix']
                    }
                });

                // Also re-emit as file_generated so the frontend replaces the content
                onFileGenerated?.({
                    path: filePath,
                    content: code,
                    validation: {
                        is_valid: validation.isValid,
                        errors: validation.errors || [],
                        warnings: validation.warnings || [],
                        fixes_applied: [...(validation.fixesApplied || []), 'Cross-file agent fix']
                    }
                });
            }

            logger.info(`Post-generation review: fixed ${Object.keys(fixedFiles).length} file(s)`);
        } catch (e) {
            logger.error(`Post-generation review failed: ${e.message}`);
            // Non-fatal — generation is still complete
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    async _syncPackageJson(generatedFiles, projectDir, onFileGenerated) {
        const pkgPath = 'package.json';
        if (!generatedFiles[pkgPath]) return;

        try {
            const pkg = JSON.parse(generatedFiles[pkgPath]);
            const allCode = Object.values(generatedFiles).join('\n');
            
            // Libraries we might have auto-added or LLM might have used without adding to package.json
            const potentialLibs = {
                'lucide-react': '^0.344.0',
                'framer-motion': '^11.0.8',
                'axios': '^1.6.7',
                'date-fns': '^3.3.1',
                'clsx': '^2.1.0',
                'tailwind-merge': '^2.2.1',
                'react-router-dom': '^6.22.1',
                '@tanstack/react-query': '^5.22.2',
                'recharts': '^2.12.1'
            };

            let updated = false;
            for (const [lib, version] of Object.entries(potentialLibs)) {
                if (allCode.includes(`from '${lib}'`) || allCode.includes(`from "${lib}"`)) {
                    if (!pkg.dependencies) pkg.dependencies = {};
                    if (!pkg.dependencies[lib]) {
                        pkg.dependencies[lib] = version;
                        updated = true;
                        logger.info(`Syncing package.json: added missing dependency ${lib}`);
                    }
                }
            }

            if (updated) {
                const newContent = JSON.stringify(pkg, null, 2);
                generatedFiles[pkgPath] = newContent;
                await this._writeFile(projectDir, pkgPath, newContent);
                onFileGenerated?.({
                    path: pkgPath,
                    content: newContent,
                    validation: { is_valid: true, errors: [], warnings: ['Synced dependencies with generated code'], fixes_applied: ['Dependency sync'] }
                });
            }
        } catch (e) {
            logger.warn(`Failed to sync package.json: ${e.message}`);
        }
    }

    _detectCircularDependencies(generatedFiles) {
        const adjacencyList = {};
        const filePaths = Object.keys(generatedFiles);

        // Build adjacency list of imports
        for (const filePath of filePaths) {
            const content = generatedFiles[filePath];
            const imports = [];
            
            // Basic regex for imports: import ... from './path' or import './path'
            // We only care about relative imports within the project
            const importRegex = /(?:import|from)\s+['"](\.\.?\/[^'"]+)['"]/g;
            let match;
            while ((match = importRegex.exec(content)) !== null) {
                let importPath = match[1];
                
                // Resolve the import path relative to the current file
                const dir = path.dirname(filePath);
                let resolved = path.normalize(path.join(dir, importPath));
                
                // Handle missing extensions (common in JS/TS)
                if (!resolved.includes('.')) {
                    const possibleExts = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro'];
                    for (const ext of possibleExts) {
                        if (generatedFiles[resolved + ext]) {
                            resolved += ext;
                            break;
                        }
                        // Also check index files
                        if (generatedFiles[path.join(resolved, 'index' + ext)]) {
                            resolved = path.join(resolved, 'index' + ext);
                            break;
                        }
                    }
                } else if (resolved.endsWith('.js') && !generatedFiles[resolved]) {
                    // LLM might import .js but file is .jsx
                    const base = resolved.substring(0, resolved.length - 3);
                    const altExts = ['.jsx', '.ts', '.tsx'];
                    for (const ext of altExts) {
                        if (generatedFiles[base + ext]) {
                            resolved = base + ext;
                            break;
                        }
                    }
                }

                if (generatedFiles[resolved]) {
                    imports.push(resolved);
                }
            }
            adjacencyList[filePath] = [...new Set(imports)];
        }

        const visited = new Set();
        const stack = new Set();
        const cycles = [];

        const findCycles = (node, path = []) => {
            visited.add(node);
            stack.add(node);
            path.push(node);

            const neighbors = adjacencyList[node] || [];
            for (const neighbor of neighbors) {
                if (stack.has(neighbor)) {
                    // Cycle detected
                    const cycleStartIdx = path.indexOf(neighbor);
                    cycles.push(path.slice(cycleStartIdx).concat(neighbor));
                } else if (!visited.has(neighbor)) {
                    findCycles(neighbor, [...path]);
                }
            }

            stack.delete(node);
        };

        for (const filePath of filePaths) {
            if (!visited.has(filePath)) {
                findCycles(filePath);
            }
        }

        return cycles;
    }

    async _writeFile(projectDir, filePath, code) {
        const projectId = path.basename(projectDir);
        await this.storage.writeFile(projectId, filePath, code);
    }

    /**
     * Sort files: config files first, then entry points, then styles, then components
     */
    _sortFiles(files, framework) {
        const priority = (f) => {
            const p = (f.path || f).toLowerCase();
            
            // 1. Core Config (Environment)
            if (p === 'package.json') return 0;
            if (p === 'tsconfig.json' || p === 'jsconfig.json') return 1;
            if (p.includes('vite.config') || p.includes('next.config') || p.includes('astro.config')) return 2;
            if (p.includes('tailwind.config') || p.includes('postcss.config')) return 3;
            
            // 2. Global Styles / Context
            if (p.includes('globals.css') || p.includes('index.css') || p.includes('style.css')) return 4;
            if (p.includes('theme') || p.includes('context') || p.includes('store')) return 5;
            
            // 3. Root Layout / Entry Point
            if (p.includes('index.html')) return 6;
            if (p.includes('layout.tsx') || p.includes('layout.astro') || p.includes('app.vue')) return 7;
            if (p.includes('main.') || p.includes('index.')) return 8;
            if (p.includes('app.') || p.includes('_app.')) return 9;
            
            // 4. Common Utils / Lib
            if (p.includes('utils/') || p.includes('lib/') || p.includes('hooks/')) return 10;
            
            // 5. Shared Components
            if (p.includes('components/common/') || p.includes('components/ui/')) return 11;
            if (p.includes('components/')) return 12;
            
            // 6. Pages / Features
            if (p.includes('pages/') || p.includes('app/') || p.includes('routes/')) return 13;
            
            // 7. Everything else
            return 100;
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
            
            // Anything that provides context or structure for other files must be sequential
            const isContextProvider = 
                p === 'package.json' || 
                p.includes('config') || 
                p.includes('tsconfig') ||
                p.includes('context') ||
                p.includes('store') ||
                p.includes('theme') ||
                p.includes('layout') ||
                p.includes('globals.css') ||
                p.includes('index.css') ||
                p.includes('style.css') ||
                p.includes('index.html') ||
                p.includes('main.') ||
                p.includes('app.');

            if (isContextProvider) {
                sequential.push(f);
            } else {
                concurrent.push(f);
            }
        }

        return { sequential, concurrent };
    }

    _isValidFilePath(filePath) {
        if (!filePath || typeof filePath !== 'string' || filePath.length === 0 || filePath.length >= 256) {
            return false;
        }
        if (filePath.includes('\0')) return false;
        if (filePath.startsWith('./') || filePath.startsWith('//')) return false;
        if (path.isAbsolute(filePath)) return false;
        if (filePath.includes('..')) return false;
        // Allow alphanumeric, dots, hyphens, underscores, slashes, and framework-specific
        // characters: [] for Next.js dynamic routes, () for route groups, @ for path aliases
        if (!/^[a-zA-Z0-9._\-/@[\]()]+$/.test(filePath)) return false;
        const depth = (filePath.match(/\//g) || []).length;
        if (depth > 8) return false;
        return true;
    }

    _sanitizeRequirements(requirements) {
        const framework = requirements.framework || config.defaultFramework;
        let stylingFramework = requirements.stylingFramework || 'plain-css';

        // Vanilla-js has no Tailwind/PostCSS pipeline in generated output.
        if (framework === config.defaultFramework) {
            stylingFramework = 'plain-css';
        }

        return {
            ...requirements,
            framework,
            stylingFramework
        };
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

        // Strip system prompt echoes and conversational filler
        const systemEchoes = [
            'You are a code generator. Output ONLY code.',
            'You are an expert full-stack developer.',
            'Output ONLY the code',
            'NO explanations, NO markdown formatting',
            'no explanations, no markdown, no comments',
            'Here is the complete code:',
            'Here is the code for',
            'Certainly! Here is the',
            'I have updated the code',
            'I have fixed the issues',
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

        // 1. Extract from markdown code blocks if present
        const codeBlockPattern = /```(?:html|css|javascript|js|jsx|tsx|typescript|ts|vue|svelte|astro|json|scss|yaml|xml)?\s*\n?([\s\S]*?)```/gi;
        const matches = [...cleanedResponse.matchAll(codeBlockPattern)];

        if (matches.length > 0) {
            // If there are multiple blocks, try to find the one that looks most like the file we want
            if (matches.length > 1) {
                const ext = filePath.split('.').pop()?.toLowerCase();
                const likelyBlock = matches.find(m => {
                    const blockContent = m[1].toLowerCase();
                    if (ext === 'html' && blockContent.includes('<!doctype')) return true;
                    if (ext === 'css' && blockContent.includes('{')) return true;
                    if (['js', 'jsx', 'ts', 'tsx'].includes(ext) && (blockContent.includes('import ') || blockContent.includes('export '))) return true;
                    if (ext === 'json' && blockContent.includes('{') && blockContent.includes('}')) return true;
                    return false;
                });
                code = (likelyBlock || matches[0])[1].trim();
            } else {
                code = matches[0][1].trim();
            }
        } else {
            // 2. Framework-specific extraction if no backticks found
            const ext = filePath.split('.').pop()?.toLowerCase();

            if (ext === 'html') {
                const htmlMatch = code.match(/<!DOCTYPE[\s\S]*?<\/html>/i) ||
                    code.match(/<html[\s\S]*?<\/html>/i);
                if (htmlMatch) code = htmlMatch[0];
            } else if (ext === 'vue') {
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
                // Truncate commentary after the last closing brace
                const lastBrace = code.lastIndexOf('}');
                if (lastBrace !== -1 && code.length - lastBrace > 100) {
                    code = code.substring(0, lastBrace + 1);
                }
            } else if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext)) {
                const hasCode = /\b(function|const|let|var|class|export|import|=>|if|for|while|module|require)\b/.test(code);
                if (!hasCode) return { code: '', error: 'No valid code found' };
                
                // Truncate commentary after code
                const lastExportIndex = code.lastIndexOf('export ');
                const lastBraceIndex = code.lastIndexOf('}');
                const cutoff = Math.max(lastExportIndex, lastBraceIndex);
                if (cutoff > 0 && code.length - cutoff > 200) {
                    const tail = code.substring(cutoff);
                    if (tail.includes('\n\n') || tail.includes('Note:')) {
                        const nextNewline = code.indexOf('\n', cutoff + 1);
                        if (nextNewline !== -1) {
                            // Only truncate if the following text doesn't look like code
                            const rest = code.substring(nextNewline).trim();
                            if (rest.length > 0 && !/^[a-zA-Z0-9_$]/.test(rest)) {
                                code = code.substring(0, nextNewline).trim();
                            }
                        }
                    }
                }
            }
        }

        // 3. Final cleanup: remove leftover triple backticks or other LLM artifacts
        code = code.replace(/```/g, '').trim();
        
        // Remove common LLM conversational starters if they still exist at the very top
        const conversationalStarters = [
            /^Here is the (?:code|updated code|complete code|corrected code).*?:\s*/i,
            /^Certainly! Here is the code.*?:\s*/i,
            /^I have (?:fixed|updated|created).*?:\s*/i,
            /^The following is the.*?:\s*/i,
            /^This code implements.*?:\s*/i
        ];
        for (const regex of conversationalStarters) {
            code = code.replace(regex, '').trim();
        }

        return { code: code.trim(), error: null };
    }
}
