import express from 'express';
import { bundleProject } from '../services/bundler.js';
import logger from '../services/logger.js';

export function createBundleRouter() {
    const router = express.Router();

    router.post('/', (req, res) => {
        try {
            const { files } = req.body;
            if (!files || typeof files !== 'object') {
                return res.status(400).json({ error: 'Files are required and must be an object' });
            }

            const result = bundleProject(files);
            res.json(result);
        } catch (error) {
            logger.error('Bundling error:', error);
            res.status(500).json({
                error: 'Internal server error during bundling',
                details: error.message
            });
        }
    });

    return router;
}
