import express from 'express';
import { bundleProject } from '../services/bundler.js';
import logger from '../services/logger.js';
import { Errors } from '../utils/errors.js';

export function createBundleRouter() {
    const router = express.Router();

    router.post('/', (req, res, next) => {
        try {
            const { files } = req.body;
            if (!files || typeof files !== 'object') {
                return next(Errors.badRequest('Files are required and must be an object'));
            }

            const result = bundleProject(files);
            res.json(result);
        } catch (error) {
            logger.error('Bundling error:', error);
            next(error);
        }
    });

    return router;
}
