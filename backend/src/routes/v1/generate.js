import express from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { checkGenerationLimit } from '../../services/usage.js';
import { GenerationController } from '../../controllers/GenerationController.js';
import { Errors } from '../../utils/errors.js';

/**
 * @param {{ generationService: import('../../services/projectGeneration.js').ProjectGenerationService, queueAvailable: boolean }} deps
 */
export function createV1GenerateRouter({ generationService, queueAvailable }) {
    const router = express.Router();
    const ctrl = new GenerationController({ generationService, queueAvailable });

    router.post(
        '/',
        authenticate,
        async (req, res, next) => {
            try {
                const lim = await checkGenerationLimit(req.user.id);
                if (!lim.ok) {
                    return next(Errors.tooManyRequests(
                        `Monthly generation limit reached (${lim.used}/${lim.limit})`,
                    ));
                }
                next();
            } catch (e) {
                next(e);
            }
        },
        ctrl.handleGenerate,
    );

    return router;
}
