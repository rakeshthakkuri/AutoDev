import crypto from 'crypto';
import logger from '../services/logger.js';
import { validateRequirements } from '../validation/requirements.js';
import { Errors } from '../utils/errors.js';

export class AnalysisController {
    /**
     * @param {{ analysisService: import('../services/analysis.js').AnalysisService }} deps
     */
    constructor({ analysisService }) {
        this.analysisService = analysisService;
        this.handleAnalyze = this.handleAnalyze.bind(this);
        this.handlePlan = this.handlePlan.bind(this);
    }

    async handleAnalyze(req, res, next) {
        try {
            const userPrompt = req.body?.prompt;
            if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
                return next(Errors.badRequest('Prompt is required and must be a non-empty string'));
            }
            if (userPrompt.length > 10000) {
                return next(Errors.badRequest('Prompt is too long (max 10000 characters)'));
            }
            const options = {
                framework: req.body?.framework || 'auto',
                styling: req.body?.styling || 'auto',
            };
            const result = await this.analysisService.analyzePrompt(userPrompt.trim(), options);
            const sessionId = crypto.randomUUID();
            return res.json({ ...result, sessionId });
        } catch (e) {
            logger.error(`Analyze API error: ${e.message}`);
            return next(e);
        }
    }

    async handlePlan(req, res, next) {
        try {
            const requirements = req.body?.requirements;
            if (!requirements || typeof requirements !== 'object') {
                return next(Errors.badRequest('Requirements object is required'));
            }
            const validationErrors = validateRequirements(requirements);
            if (validationErrors) {
                return next(Errors.badRequest('Invalid requirements', 'BAD_REQUEST', validationErrors));
            }
            const result = await this.analysisService.generatePlan(requirements);
            return res.json(result);
        } catch (e) {
            logger.error(`Plan API error: ${e.message}`);
            return next(e);
        }
    }
}
