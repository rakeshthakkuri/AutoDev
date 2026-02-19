import express from 'express';
import crypto from 'crypto';
import logger from '../services/logger.js';

/**
 * @param {import('../services/analysis.js').AnalysisService} analysisService
 */
export function createAnalyzeRouter(analysisService) {
    const router = express.Router();

    router.post('/', async (req, res) => {
        try {
            const userPrompt = req.body?.prompt;
            if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
                return res.status(400).json({ error: 'Prompt is required and must be a non-empty string' });
            }
            if (userPrompt.length > 10000) {
                return res.status(400).json({ error: 'Prompt is too long (max 10000 characters)' });
            }
            const options = {
                framework: req.body?.framework || 'auto',
                styling: req.body?.styling || 'auto',
            };
            const result = await analysisService.analyzePrompt(userPrompt.trim(), options);
            const sessionId = crypto.randomUUID();
            return res.json({ ...result, sessionId });
        } catch (e) {
            logger.error(`Analyze API error: ${e.message}`);
            return res.status(500).json({ error: 'Analysis failed', details: e.message });
        }
    });

    return router;
}
