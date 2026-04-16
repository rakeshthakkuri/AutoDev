import jwt from 'jsonwebtoken';
import config from '../../config.js';

const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';

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
    return jwt.sign(
        { sub: userId, typ: 'refresh' },
        config.jwtRefreshSecret,
        { expiresIn: REFRESH_TTL },
    );
}

export async function rotateRefreshToken(oldRefreshJwt) {
    requireSecrets();
    const payload = jwt.verify(oldRefreshJwt, config.jwtRefreshSecret);
    if (payload.typ !== 'refresh') throw new Error('Invalid token type');
    const user = { id: payload.sub, email: payload.email };
    const access = generateAccessToken(user);
    const refresh = await generateRefreshToken(user.id);
    return { access, refresh, user };
}

export async function revokeRefreshToken(_refreshJwt) {
    // No-op without a database — tokens expire naturally.
}
