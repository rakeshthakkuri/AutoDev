import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '../../db/index.js';

const PREFIX_LEN = 12;

function randomKey() {
    const body = crypto.randomBytes(24).toString('base64url');
    return `sk_live_${body}`;
}

/**
 * @returns {Promise<{ id: string, name: string | null, key: string }>}
 */
export async function createApiKey(userId, name = 'default') {
    const plain = randomKey();
    const keyPrefix = plain.slice(0, PREFIX_LEN);
    const keyHash = await bcrypt.hash(plain, 12);
    const { rows } = await query(
        `INSERT INTO api_keys (user_id, name, key_prefix, key_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name`,
        [userId, name, keyPrefix, keyHash],
    );
    return { id: rows[0].id, name: rows[0].name, key: plain };
}

/**
 * @returns {Promise<{ id: string, email: string, apiKeyId: string } | null>}
 */
export async function verifyApiKey(plain) {
    if (!plain || typeof plain !== 'string' || !plain.startsWith('sk_')) return null;
    const prefix = plain.slice(0, PREFIX_LEN);
    const { rows } = await query(
        `SELECT ak.id, ak.key_hash, ak.user_id, u.email
         FROM api_keys ak
         JOIN users u ON u.id = ak.user_id
         WHERE ak.key_prefix = $1`,
        [prefix],
    );
    for (const row of rows) {
        if (await bcrypt.compare(plain, row.key_hash)) {
            await query(
                `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
                [row.id],
            );
            return {
                id: row.user_id,
                email: row.email,
                apiKeyId: row.id,
            };
        }
    }
    return null;
}

export async function listApiKeys(userId) {
    const { rows } = await query(
        `SELECT id, name, key_prefix, created_at, last_used_at
         FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
    );
    return rows;
}

export async function deleteApiKey(userId, keyId) {
    const { rowCount } = await query(
        `DELETE FROM api_keys WHERE id = $1 AND user_id = $2`,
        [keyId, userId],
    );
    return rowCount > 0;
}
