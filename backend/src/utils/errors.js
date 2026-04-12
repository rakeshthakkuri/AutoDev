export class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = undefined) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        if (details !== undefined) this.details = details;
    }
}

export const Errors = {
    badRequest: (msg, code = 'BAD_REQUEST', details) => new AppError(msg, 400, code, details),
    unauthorized: (msg = 'Unauthorized') => new AppError(msg, 401, 'UNAUTHORIZED'),
    forbidden: (msg = 'Forbidden') => new AppError(msg, 403, 'FORBIDDEN'),
    notFound: (msg = 'Not found') => new AppError(msg, 404, 'NOT_FOUND'),
    conflict: (msg) => new AppError(msg, 409, 'CONFLICT'),
    tooManyRequests: (msg = 'Rate limit exceeded') => new AppError(msg, 429, 'RATE_LIMITED'),
    internal: (msg = 'Internal server error') => new AppError(msg, 500, 'INTERNAL_ERROR'),
    llmFailure: (msg) => new AppError(msg, 503, 'LLM_UNAVAILABLE'),
};
