import { verifyAccessToken } from '../services/auth/jwt.js';
import { verifyApiKey } from '../services/auth/apiKey.js';
import { Errors } from '../utils/errors.js';

/**
 * Bearer JWT or API key (`sk_...`).
 * Sets `req.user` = `{ id, email?, apiKeyId? }`.
 */
export async function authenticate(req, res, next) {
    try {
        const h = req.headers.authorization;
        if (!h || !h.startsWith('Bearer ')) {
            return next(Errors.unauthorized('Missing or invalid Authorization header'));
        }
        const token = h.slice(7).trim();
        if (!token) return next(Errors.unauthorized());

        if (token.startsWith('sk_')) {
            const u = await verifyApiKey(token);
            if (!u) return next(Errors.unauthorized('Invalid API key'));
            req.user = { id: u.id, email: u.email, apiKeyId: u.apiKeyId };
            return next();
        }

        const payload = verifyAccessToken(token);
        req.user = { id: payload.sub, email: payload.email };
        return next();
    } catch {
        return next(Errors.unauthorized('Invalid or expired token'));
    }
}
