import crypto from 'crypto';
import express from 'express';
import logger from '../services/logger.js';

const activeGenerations = new Map();
const SESSION_CLEANUP_MS = 60000;

function getClientId(req) {
    const sessionId = req.headers['x-session-id'];
    if (sessionId && typeof sessionId === 'string' && /^[a-f0-9-]{36}$/i.test(sessionId.trim())) {
        return sessionId.trim();
    }
    return req.ip || 'unknown';
}

function cleanupStaleSessions() {
    const now = Date.now();
    for (const [key, data] of activeGenerations.entries()) {
        if (typeof data === 'object' && data.startedAt && now - data.startedAt > SESSION_CLEANUP_MS) {
            activeGenerations.delete(key);
        }
    }
}
setInterval(cleanupStaleSessions, 15000);

function sendSSE(res, event, data) {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
}

/**
 * @param {import('../services/projectGeneration.js').ProjectGenerationService} projectGenerationService
 */
export function createGenerateRouter(projectGenerationService) {
    const router = express.Router();

    router.post('/', async (req, res) => {
        const clientId = getClientId(req);

        if (activeGenerations.has(clientId)) {
            return res.status(409).json({ error: 'A generation is already in progress. Please wait.' });
        }

        const { prompt: userPrompt, requirements, plan } = req.body || {};

        if (!userPrompt || !requirements || !plan) {
            return res.status(400).json({ error: 'Missing required fields: prompt, requirements, or plan' });
        }

        const planFiles = plan?.files;
        if (!Array.isArray(planFiles) || planFiles.length === 0) {
            return res.status(400).json({ error: 'Invalid plan: files array required with at least one file' });
        }
        const invalidFile = planFiles.find(f => !f || typeof (f.path ?? f) !== 'string' || !(f.path ?? f).trim());
        if (invalidFile) {
            return res.status(400).json({ error: 'Invalid plan: every file must have a valid path' });
        }

        const generationId = crypto.randomUUID();

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });

        let cancelled = false;
        activeGenerations.set(clientId, { startedAt: Date.now() });

        req.on('close', () => {
            cancelled = true;
            activeGenerations.delete(clientId);
            logger.info(`SSE client disconnected (generation cancelled): ${clientId}`);
        });

        try {
            logger.info('NEW GENERATION REQUEST', { generationId, userPrompt: userPrompt.substring(0, 100), framework: requirements.framework, styling: requirements.stylingFramework, complexity: requirements.complexity, fileCount: plan.files?.length });

            if (!cancelled) {
                sendSSE(res, 'status', { message: 'Starting generation...', progress: 0, generationId });
            }

            const result = await projectGenerationService.generateProject({
                generationId,
                userPrompt,
                requirements,
                plan,
                onProgress: (message, progress, extra) => {
                    if (cancelled) return;
                    sendSSE(res, 'status', { message, progress, generationId, ...extra });
                },
                onFileGenerated: (fileData) => {
                    if (cancelled) return;
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
                sendSSE(res, 'generation_complete', {
                    message: 'Project generated successfully',
                    projectId: result.projectId,
                    downloadUrl: result.downloadUrl,
                    metrics: { duration: result.duration, filesGenerated: result.filesGenerated },
                    error: null
                });
            }
        } catch (error) {
            logger.error(`Generation error: ${error.message}`, { error: error.stack });
            if (!cancelled) {
                const payload = {
                    error: error.message || 'Project generation failed',
                    // Never expose stack traces to clients — log them server-side only
                };
                if (error.generationResult) {
                    payload.filesGenerated = error.generationResult.filesGenerated;
                    payload.partialSuccess = error.generationResult.partialSuccess;
                }
                sendSSE(res, 'generation_error', payload);
            }
        } finally {
            activeGenerations.delete(clientId);
            if (!res.writableEnded) res.end();
        }
    });

    return router;
}
