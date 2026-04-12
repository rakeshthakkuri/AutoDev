import express from 'express';
import { AnalysisController } from '../controllers/AnalysisController.js';

/**
 * @param {import('../services/analysis.js').AnalysisService} analysisService
 */
export function createAnalyzeRouter(analysisService) {
    const router = express.Router();
    const ctrl = new AnalysisController({ analysisService });
    router.post('/', ctrl.handleAnalyze);
    return router;
}
