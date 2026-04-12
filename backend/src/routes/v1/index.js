import express from 'express';
import { createV1GenerateRouter } from './generate.js';
import { createV1ProjectsRouter } from './projects.js';

/**
 * @param {{
 *   generationService: import('../../services/projectGeneration.js').ProjectGenerationService,
 *   storageService: import('../../services/storage/StorageService.js').StorageService,
 *   queueAvailable: boolean,
 * }} deps
 */
export function createV1Router(deps) {
    const router = express.Router();

    router.use((req, res, next) => {
        res.set('API-Version', 'v1');
        next();
    });

    router.use('/generate', createV1GenerateRouter(deps));
    router.use('/projects', createV1ProjectsRouter(deps));

    return router;
}
