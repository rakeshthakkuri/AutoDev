// ═══════════════════════════════════════════════════════════════════════════════
// Edit Route — POST /api/edit (SSE)
// Handles user edits and propagates changes to dependent files.
// ═══════════════════════════════════════════════════════════════════════════════

import express from 'express';
import logger from '../services/logger.js';
import { Errors } from '../utils/errors.js';
import { ProjectMemory } from '../agents/shared/memory.js';
import { AgentEventEmitter } from '../agents/shared/events.js';
import { EditorAgent } from '../agents/editor/agent.js';
import { extractContracts } from '../agents/shared/contracts.js';

function sendSSE(res, event, data) {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
}

/**
 * @param {{ validator: import('../services/validator.js').CodeValidator, generationService: import('../services/projectGeneration.js').ProjectGenerationService }} services
 */
export function createEditRouter(services) {
    const router = express.Router();

    router.post('/', async (req, res, next) => {
        const { editType, payload, currentFiles } = req.body || {};

        if (!editType || !payload) {
            return next(Errors.badRequest('Missing editType or payload'));
        }

        if (!['direct', 'prompt', 'feature'].includes(editType)) {
            return next(Errors.badRequest('Invalid editType. Must be: direct, prompt, or feature'));
        }

        if (!currentFiles || typeof currentFiles !== 'object') {
            return next(Errors.badRequest('currentFiles is required (object mapping path → content)'));
        }

        // Set up SSE
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });

        let cancelled = false;
        req.on('close', () => { cancelled = true; });

        try {
            // Reconstruct ProjectMemory from current files
            const memory = new ProjectMemory();
            for (const [filePath, content] of Object.entries(currentFiles)) {
                memory.setFileGenerated(filePath, content, { isValid: true });
            }

            // Create event emitter that maps to SSE
            const emitter = new AgentEventEmitter({
                onEditStart: (data) => !cancelled && sendSSE(res, 'edit_start', data),
                onEditFileUpdating: (data) => !cancelled && sendSSE(res, 'edit_file_updating', data),
                onEditFileUpdated: (data) => !cancelled && sendSSE(res, 'edit_file_updated', data),
                onEditComplete: (data) => !cancelled && sendSSE(res, 'edit_complete', data),
            });

            const editor = new EditorAgent(services);
            const framework = req.body.framework || 'react';

            let result;
            switch (editType) {
                case 'direct':
                    if (!payload.filePath || !payload.newContent) {
                        sendSSE(res, 'edit_error', { error: 'direct edit requires filePath and newContent' });
                        break;
                    }
                    result = await editor.handleDirectEdit({
                        filePath: payload.filePath,
                        newContent: payload.newContent,
                        memory,
                        emitter,
                        framework,
                    });
                    break;

                case 'prompt':
                    if (!payload.refinementPrompt) {
                        sendSSE(res, 'edit_error', { error: 'prompt edit requires refinementPrompt' });
                        break;
                    }
                    result = await editor.handlePromptRefinement({
                        refinementPrompt: payload.refinementPrompt,
                        targetFiles: payload.targetFiles,
                        memory,
                        emitter,
                        framework,
                    });
                    break;

                case 'feature':
                    if (!payload.featurePrompt) {
                        sendSSE(res, 'edit_error', { error: 'feature edit requires featurePrompt' });
                        break;
                    }
                    result = await editor.handleFeatureAddition({
                        featurePrompt: payload.featurePrompt,
                        memory,
                        emitter,
                        requirements: { framework },
                    });
                    break;
            }

            if (result && !cancelled) {
                sendSSE(res, 'edit_complete', {
                    updatedFiles: result.updatedFiles || result.newFiles || [],
                    metrics: result.metrics,
                });
            }
        } catch (error) {
            logger.error(`Edit error: ${error.message}`);
            if (!cancelled) {
                sendSSE(res, 'edit_error', { error: error.message });
            }
        } finally {
            if (!res.writableEnded) res.end();
        }
    });

    return router;
}
