import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import config from '../config.js';
import {
    generateAccessToken,
    generateRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
} from '../services/auth/jwt.js';
import { createApiKey, listApiKeys, deleteApiKey } from '../services/auth/apiKey.js';
import { authenticate } from '../middleware/authenticate.js';
import { Errors } from '../utils/errors.js';
import logger from '../services/logger.js';

export function createAuthRouter() {
    const router = express.Router();

    router.post('/register', async (req, res, next) => {
        try {
            if (!config.jwtSecret || !config.jwtRefreshSecret) {
                return next(Errors.internal('Auth is not configured'));
            }
            const email = String(req.body?.email || '').trim().toLowerCase();
            const password = String(req.body?.password || '');
            if (!email.includes('@')) return next(Errors.badRequest('Valid email required'));
            if (password.length < 8) return next(Errors.badRequest('Password must be at least 8 characters'));

            const passwordHash = await bcrypt.hash(password, 12);
            let userId;
            try {
                const { rows } = await query(
                    `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, plan`,
                    [email, passwordHash],
                );
                userId = rows[0].id;
            } catch (e) {
                if (e.code === '23505') return next(Errors.conflict('Email already registered'));
                throw e;
            }

            const user = { id: userId, email };
            const access = generateAccessToken(user);
            const refresh = await generateRefreshToken(userId);
            res.status(201).json({ access, refresh, user: { id: userId, email, plan: 'free' } });
        } catch (err) {
            logger.error('register error', { error: err.message });
            next(err);
        }
    });

    router.post('/login', async (req, res, next) => {
        try {
            if (!config.jwtSecret || !config.jwtRefreshSecret) {
                return next(Errors.internal('Auth is not configured'));
            }
            const email = String(req.body?.email || '').trim().toLowerCase();
            const password = String(req.body?.password || '');
            const { rows } = await query(
                `SELECT id, email, password_hash, plan FROM users WHERE email = $1`,
                [email],
            );
            const row = rows[0];
            if (!row || !(await bcrypt.compare(password, row.password_hash))) {
                return next(Errors.unauthorized('Invalid email or password'));
            }
            const user = { id: row.id, email: row.email };
            const access = generateAccessToken(user);
            const refresh = await generateRefreshToken(row.id);
            res.json({
                access,
                refresh,
                user: { id: row.id, email: row.email, plan: row.plan },
            });
        } catch (err) {
            next(err);
        }
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

    router.get('/me', authenticate, async (req, res, next) => {
        try {
            const { rows } = await query(
                `SELECT id, email, plan, created_at FROM users WHERE id = $1`,
                [req.user.id],
            );
            const row = rows[0];
            if (!row) return next(Errors.notFound('User not found'));
            res.json({
                id: row.id,
                email: row.email,
                plan: row.plan,
                createdAt: row.created_at,
            });
        } catch (err) {
            next(err);
        }
    });

    router.post('/api-keys', authenticate, async (req, res, next) => {
        try {
            const name = String(req.body?.name || 'default').slice(0, 64);
            const out = await createApiKey(req.user.id, name);
            res.status(201).json(out);
        } catch (err) {
            next(err);
        }
    });

    router.get('/api-keys', authenticate, async (req, res, next) => {
        try {
            const keys = await listApiKeys(req.user.id);
            res.json({ keys });
        } catch (err) {
            next(err);
        }
    });

    router.delete('/api-keys/:id', authenticate, async (req, res, next) => {
        try {
            const ok = await deleteApiKey(req.user.id, req.params.id);
            if (!ok) return next(Errors.notFound('API key not found'));
            res.json({ ok: true });
        } catch (err) {
            next(err);
        }
    });

    return router;
}
