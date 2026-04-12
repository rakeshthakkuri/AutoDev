import { requestContext } from './requestId.js';
import logger from '../services/logger.js';

export function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    const ctx = requestContext.getStore();
    const requestId = ctx?.requestId || req.requestId;
    const statusCode = err.isOperational ? err.statusCode : 500;
    const code = err.code || 'INTERNAL_ERROR';

    if (statusCode >= 500) {
        logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId });
    }

    const payload = {
        error: err.isOperational ? err.message : 'Internal server error',
        code,
        requestId,
        timestamp: new Date().toISOString(),
    };
    if (err.details !== undefined) payload.details = err.details;

    res.status(statusCode).json(payload);
}
