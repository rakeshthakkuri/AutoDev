import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

export const requestContext = new AsyncLocalStorage();

export function requestIdMiddleware(req, res, next) {
    const requestId = req.headers['x-request-id'] || randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    requestContext.run({ requestId }, next);
}
