import express from 'express';
import { GenerationController } from '../controllers/GenerationController.js';

/**
 * @param {{ generationService: import('../services/projectGeneration.js').ProjectGenerationService, queueAvailable?: boolean }} deps
 */
export function createGenerateRouter({ generationService, queueAvailable = false }) {
    const router = express.Router();
    const ctrl = new GenerationController({ generationService, queueAvailable });

    router.get('/:jobId/status', ctrl.getStatus);
    router.get('/:jobId/stream', ctrl.streamProgress);
    router.post('/', ctrl.handleGenerate);

    return router;
}
