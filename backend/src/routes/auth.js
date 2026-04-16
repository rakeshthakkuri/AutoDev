import express from 'express';
import config from '../config.js';
import {
    generateAccessToken,
    generateRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
} from '../services/auth/jwt.js';
import { authenticate } from '../middleware/authenticate.js';
import { Errors } from '../utils/errors.js';
import logger from '../services/logger.js';

export function createAuthRouter() {
    const router = express.Router();

    router.post('/register', async (_req, _res, next) => {
        return next(Errors.internal('User accounts are not available in this deployment'));
    });

    router.post('/login', async (_req, _res, next) => {
        return next(Errors.internal('User accounts are not available in this deployment'));
    });

    router.post('/refresh', async (req, res, next) => {
        try {
            const refresh = String(req.body?.refresh || req.body?.refreshToken || '');
            if (!refresh) return next(Errors.badRequest('refresh token required'));
            const out = await rotateRefreshToken(refresh);
            res.json({
                access: out.access,
                refresh: out.refresh,
                user: { id: out.user.id, email: out.user.email },
            });
        } catch (err) {
            next(Errors.unauthorized(err.message || 'Invalid refresh'));
        }
    });

    router.post('/logout', async (req, res, next) => {
        try {
            const refresh = String(req.body?.refresh || req.body?.refreshToken || '');
            if (refresh) await revokeRefreshToken(refresh);
            res.json({ ok: true });
        } catch (err) {
            next(err);
        }
    });

    router.get('/me', authenticate, async (req, res) => {
        res.json({
            id: req.user.id,
            email: req.user.email ?? null,
            plan: 'free',
            createdAt: null,
        });
    });

    router.post('/api-keys', authenticate, async (_req, _res, next) => {
        return next(Errors.internal('API keys are not available in this deployment'));
    });

    router.get('/api-keys', authenticate, async (_req, res) => {
        res.json({ keys: [] });
    });

    router.delete('/api-keys/:id', authenticate, async (_req, _res, next) => {
        return next(Errors.notFound('API key not found'));
    });

    return router;
}
