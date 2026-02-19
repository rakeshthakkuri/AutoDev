import express from 'express';
import logger from '../services/logger.js';
import { validateRequirements } from '../validation/requirements.js';

/**
 * @param {import('../services/analysis.js').AnalysisService} analysisService
 */
export function createPlanRouter(analysisService) {
    const router = express.Router();

    router.post('/', async (req, res) => {
        try {
            const requirements = req.body?.requirements;
            if (!requirements || typeof requirements !== 'object') {
                return res.status(400).json({ error: 'Requirements object is required' });
            }
            const validationErrors = validateRequirements(requirements);
            if (validationErrors) {
                return res.status(400).json({ error: 'Invalid requirements', fields: validationErrors });
            }
            const result = await analysisService.generatePlan(requirements);
            return res.json(result);
        } catch (e) {
            logger.error(`Plan API error: ${e.message}`);
            return res.status(500).json({ error: 'Planning failed', details: e.message });
        }
    });

    return router;
}
