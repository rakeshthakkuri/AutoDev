import express from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { Errors } from '../../utils/errors.js';

/**
 * @param {{ storageService: import('../../services/storage/StorageService.js').StorageService }} _deps
 */
export function createV1ProjectsRouter({ storageService }) {
    const router = express.Router();

    router.use(authenticate);

    router.get('/', (_req, res) => {
        res.set('API-Version', 'v1');
        res.json({ items: [], total: 0, limit: 20, offset: 0 });
    });

    router.get('/:jobId', (_req, _res, next) => {
        next(Errors.notFound('Project not found'));
    });

    router.delete('/:jobId', (_req, _res, next) => {
        next(Errors.notFound('Project not found'));
    });

    return router;
}
