import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../../db/index.js';
import config from '../../config.js';

const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sha256(s) {
    return crypto.createHash('sha256').update(s).digest('hex');
}

function requireSecrets() {
    if (!config.jwtSecret || !config.jwtRefreshSecret) {
        throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set for auth');
    }
}

export function generateAccessToken(user) {
    requireSecrets();
    return jwt.sign(
        { sub: user.id, email: user.email, typ: 'access' },
        config.jwtSecret,
        { expiresIn: ACCESS_TTL },
    );
}

export function verifyAccessToken(token) {
    requireSecrets();
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.typ !== 'access') throw new Error('Invalid token type');
    return payload;
}

export async function generateRefreshToken(userId) {
    requireSecrets();
    const raw = jwt.sign(
        { sub: userId, typ: 'refresh' },
        config.jwtRefreshSecret,
        { expiresIn: REFRESH_TTL },
    );
    const tokenHash = sha256(raw);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt],
    );
    return raw;
}

export async function rotateRefreshToken(oldRefreshJwt) {
    requireSecrets();
    jwt.verify(oldRefreshJwt, config.jwtRefreshSecret);
    const tokenHash = sha256(oldRefreshJwt);
    const { rows } = await query(
        `SELECT id, user_id FROM refresh_tokens
         WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()`,
        [tokenHash],
    );
    if (!rows.length) throw new Error('Refresh token invalid or revoked');

    await query(`UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1`, [rows[0].id]);

    const { rows: userRows } = await query('SELECT id, email FROM users WHERE id = $1', [rows[0].user_id]);
    const user = userRows[0];
    if (!user) throw new Error('User not found');

    const access = generateAccessToken(user);
    const refresh = await generateRefreshToken(user.id);
    return { access, refresh, user };
}

export async function revokeRefreshToken(refreshJwt) {
    requireSecrets();
    try {
        jwt.verify(refreshJwt, config.jwtRefreshSecret);
    } catch {
        return;
    }
    const tokenHash = sha256(refreshJwt);
    await query(
        `UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1`,
        [tokenHash],
    );
}
