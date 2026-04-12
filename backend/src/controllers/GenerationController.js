import crypto from 'crypto';
import logger from '../services/logger.js';
import { acquireLock, releaseLock } from '../services/lock.js';
import {
    createGenerationRecord,
    updateGenerationRecord,
    getGenerationRecord,
    hasActiveGenerationForSession,
} from '../services/generationStore.js';
import { recordGeneration } from '../routes/metrics.js';
import { enqueueGeneration } from '../services/queue/index.js';
import { Errors } from '../utils/errors.js';

function getClientId(req) {
    const sessionId = req.headers['x-session-id'];
    if (sessionId && typeof sessionId === 'string' && /^[a-f0-9-]{36}$/i.test(sessionId.trim())) {
        return sessionId.trim();
    }
    return req.ip || 'unknown';
}

function sendSSE(res, event, data) {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
}

export class GenerationController {
    /**
     * @param {{ generationService: import('../services/projectGeneration.js').ProjectGenerationService, queueAvailable?: boolean }} deps
     */
    constructor({ generationService, queueAvailable = false }) {
        this.generationService = generationService;
        this.queueAvailable = queueAvailable;
        this.getStatus = this.getStatus.bind(this);
        this.handleGenerate = this.handleGenerate.bind(this);
        this.streamProgress = this.streamProgress.bind(this);
    }

    async getStatus(req, res, next) {
        try {
            const record = await getGenerationRecord(req.params.jobId);
            if (!record) return next(Errors.notFound('Generation job not found'));
            res.json(record);
        } catch (err) {
            next(err);
        }
    }

    async handleGenerate(req, res, next) {
        const clientId = req.user ? String(req.user.id) : getClientId(req);
        const { prompt: userPrompt, requirements, plan } = req.body || {};
        const userId = req.user?.id ?? null;
        const apiKeyId = req.user?.apiKeyId ?? null;

        if (!userPrompt || !requirements || !plan) {
            return next(Errors.badRequest('Missing required fields: prompt, requirements, or plan'));
        }

        const planFiles = plan?.files;
        if (!Array.isArray(planFiles) || planFiles.length === 0) {
            return next(Errors.badRequest('Invalid plan: files array required with at least one file'));
        }
        const invalidFile = planFiles.find(f => !f || typeof (f.path ?? f) !== 'string' || !(f.path ?? f).trim());
        if (invalidFile) {
            return next(Errors.badRequest('Invalid plan: every file must have a valid path'));
        }

        const acquired = await acquireLock(clientId, 300_000);
        if (!acquired) {
            return next(Errors.conflict('Generation already in progress for this session'));
        }

        const generationId = crypto.randomUUID();
        const totalFiles = planFiles.length;
        let filesGeneratedCount = 0;

        const storeOpts = { requirements, plan, userId, apiKeyId };

        if (this.queueAvailable) {
            try {
                const alreadyRunning = await hasActiveGenerationForSession(clientId);
                if (alreadyRunning) {
                    await releaseLock(clientId).catch(() => {});
                    return next(Errors.conflict('Generation already in progress for this session'));
                }
                await createGenerationRecord(generationId, clientId, typeof userPrompt === 'string' ? userPrompt : '', totalFiles, storeOpts);
                await updateGenerationRecord(generationId, { status: 'pending', progress: 0 });
                await enqueueGeneration(generationId, {
                    jobId: generationId,
                    clientId,
                    userPrompt,
                    requirements,
                    plan,
                    userId,
                    apiKeyId,
                });
                await releaseLock(clientId).catch(() => {});
                const base = `${req.protocol}://${req.get('host')}`;
                return res.status(202).json({
                    jobId: generationId,
                    status: 'pending',
                    statusUrl: `${base}/api/generate/${generationId}/status`,
                    streamUrl: `${base}/api/generate/${generationId}/stream`,
                });
            } catch (err) {
                await releaseLock(clientId).catch(() => {});
                await updateGenerationRecord(generationId, { status: 'failed', errorMessage: err.message }).catch(() => {});
                return next(err);
            }
        }

        await createGenerationRecord(generationId, clientId, typeof userPrompt === 'string' ? userPrompt : '', totalFiles, storeOpts);
        await updateGenerationRecord(generationId, { status: 'generating', progress: 0 });

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });

        let cancelled = false;

        req.on('close', () => {
            cancelled = true;
            void releaseLock(clientId);
            logger.info(`SSE client disconnected (generation cancelled): ${clientId}`);
        });

        try {
            logger.info('NEW GENERATION REQUEST', { generationId, userPrompt: userPrompt.substring(0, 100), framework: requirements.framework, styling: requirements.stylingFramework, complexity: requirements.complexity, fileCount: plan.files?.length });

            if (!cancelled) {
                sendSSE(res, 'status', { message: 'Starting generation...', progress: 0, generationId });
            }

            const result = await this.generationService.generateProject({
                generationId,
                userPrompt,
                requirements,
                plan,
                onProgress: (message, progress, extra) => {
                    if (cancelled) return;
                    sendSSE(res, 'status', { message, progress, generationId, ...extra });
                },
                onFileGenerated: async (fileData) => {
                    if (cancelled) return;
                    filesGeneratedCount += 1;
                    await updateGenerationRecord(generationId, {
                        filesGenerated: filesGeneratedCount,
                        status: 'generating',
                        progress: totalFiles ? Math.round((filesGeneratedCount / totalFiles) * 100) : 0,
                    });
                    sendSSE(res, 'file_generated', fileData);
                },
                onFileChunk: (chunkData) => {
                    if (cancelled) return;
                    sendSSE(res, 'file_chunk', chunkData);
                },
                onPlan: (planData) => {
                    if (cancelled) return;
                    sendSSE(res, 'generation_plan', planData);
                },
                onError: (error) => {
                    if (cancelled) return;
                    sendSSE(res, 'file_error', error);
                },
                onFileFixing: (fixData) => {
                    if (cancelled) return;
                    sendSSE(res, 'file_fixing', fixData);
                },
                onFileFixed: (fixedData) => {
                    if (cancelled) return;
                    sendSSE(res, 'file_fixed', fixedData);
                },
            });

            if (!cancelled) {
                if (result.metricsRecord) {
                    await recordGeneration(result.metricsRecord);
                }
                await updateGenerationRecord(generationId, {
                    status: 'complete',
                    progress: 100,
                    filesGenerated: filesGeneratedCount,
                    storagePath: result.projectId,
                });
                sendSSE(res, 'generation_complete', {
                    message: 'Project generated successfully',
                    projectId: result.projectId,
                    downloadUrl: result.downloadUrl,
                    metrics: { duration: result.duration, filesGenerated: result.filesGenerated },
                    error: null,
                });
            }
        } catch (error) {
            logger.error(`Generation error: ${error.message}`, { error: error.stack });
            await updateGenerationRecord(generationId, { status: 'failed', errorMessage: error.message || 'Project generation failed' });
            if (!cancelled) {
                if (error.metricsRecord) {
                    await recordGeneration(error.metricsRecord);
                }
                const payload = {
                    error: error.message || 'Project generation failed',
                };
                if (error.generationResult) {
                    payload.filesGenerated = error.generationResult.filesGenerated;
                    payload.partialSuccess = error.generationResult.partialSuccess;
                }
                sendSSE(res, 'generation_error', payload);
            }
        } finally {
            await releaseLock(clientId);
            if (!res.writableEnded) res.end();
        }
    }

    /**
     * SSE stream that polls generation record (used with async jobs).
     */
    async streamProgress(req, res, next) {
        try {
            const { jobId } = req.params;
            const record = await getGenerationRecord(jobId);
            if (!record) return next(Errors.notFound('Generation job not found'));

            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
            });

            let lastProgress = -1;
            let pollFailures = 0;
            const maxPollFailures = 5;
            const poll = setInterval(async () => {
                try {
                    const current = await getGenerationRecord(jobId);
                    pollFailures = 0;
                    if (!current) {
                        clearInterval(poll);
                        if (!res.writableEnded) res.end();
                        return;
                    }

                    if (current.progress !== lastProgress) {
                        lastProgress = current.progress;
                        sendSSE(res, 'progress', {
                            status: current.status,
                            progress: current.progress,
                            filesGenerated: current.filesGenerated,
                            totalFiles: current.totalFiles,
                            downloadUrl: current.downloadUrl,
                        });
                    }

                    if (current.status === 'complete') {
                        sendSSE(res, 'complete', {
                            jobId,
                            status: 'complete',
                            downloadUrl: current.downloadUrl,
                            storagePath: current.storagePath,
                        });
                        clearInterval(poll);
                        if (!res.writableEnded) res.end();
                    } else if (current.status === 'failed') {
                        sendSSE(res, 'error', { jobId, error: current.errorMessage });
                        clearInterval(poll);
                        if (!res.writableEnded) res.end();
                    }
                } catch (err) {
                    pollFailures += 1;
                    logger.error('Error in progress stream poll', { jobId, error: err.message, pollFailures });
                    if (pollFailures >= maxPollFailures) {
                        clearInterval(poll);
                        sendSSE(res, 'error', {
                            jobId,
                            error: 'Lost connection to job status; try again or poll /status',
                            code: 'POLL_STATUS_FAILED',
                        });
                        if (!res.writableEnded) res.end();
                    }
                }
            }, 2_000);

            req.on('close', () => clearInterval(poll));
        } catch (err) {
            next(err);
        }
    }
}
