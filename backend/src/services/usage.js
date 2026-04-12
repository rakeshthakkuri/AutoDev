import { query } from '../db/index.js';
import config from '../config.js';
import logger from './logger.js';

const FREE_MONTHLY_GENERATIONS = parseInt(process.env.FREE_TIER_MONTHLY_GENERATIONS, 10) || 50;

/**
 * @param {string} userId
 * @returns {Promise<{ ok: boolean, used: number, limit: number | null }>}
 */
export async function checkGenerationLimit(userId) {
    if (!config.databaseUrl) {
        return { ok: true, used: 0, limit: null };
    }
    try {
        const { rows: ur } = await query(
            `SELECT plan FROM users WHERE id = $1`,
            [userId],
        );
        const plan = ur[0]?.plan || 'free';
        if (plan === 'pro') {
            return { ok: true, used: 0, limit: null };
        }
        const { rows } = await query(
            `SELECT COUNT(*)::int AS c
             FROM usage_events
             WHERE user_id = $1
               AND event_type = 'generation'
               AND created_at >= date_trunc('month', NOW())`,
            [userId],
        );
        const used = rows[0]?.c ?? 0;
        const limit = FREE_MONTHLY_GENERATIONS;
        return { ok: used < limit, used, limit };
    } catch (err) {
        logger.error('checkGenerationLimit failed', { error: err.message });
        return { ok: true, used: 0, limit: null };
    }
}

/**
 * @param {{
 *   userId: string,
 *   apiKeyId?: string | null,
 *   projectId?: string | null,
 *   eventType: string,
 *   tokensUsed?: number | null,
 *   durationMs?: number | null,
 *   llmProvider?: string | null,
 * }} p
 */
export async function recordUsageEvent({
    userId,
    apiKeyId = null,
    projectJobId = null,
    eventType,
    tokensUsed = null,
    durationMs = null,
    llmProvider = null,
}) {
    if (!config.databaseUrl || !userId) return;
    let projectUuid = null;
    if (projectJobId) {
        const r = await query('SELECT id FROM projects WHERE job_id = $1 LIMIT 1', [projectJobId]).catch(() => ({ rows: [] }));
        projectUuid = r.rows[0]?.id ?? null;
    }
    await query(
        `INSERT INTO usage_events (user_id, api_key_id, project_id, event_type, tokens_used, duration_ms, llm_provider)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, apiKeyId, projectUuid, eventType, tokensUsed, durationMs, llmProvider],
    );
}
