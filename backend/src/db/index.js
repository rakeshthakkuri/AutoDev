import pg from 'pg';
import config from '../config.js';
import logger from '../services/logger.js';

const { Pool } = pg;

let pool = null;

function getPool() {
    if (!config.databaseUrl) {
        throw new Error('DATABASE_URL is not configured');
    }
    if (!pool) {
        const isLocal = /localhost|127\.0\.0\.1/i.test(config.databaseUrl);
        pool = new Pool({
            connectionString: config.databaseUrl,
            max: 20,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 5_000,
            ssl: isLocal ? false : { rejectUnauthorized: false },
        });
        pool.on('error', (err) => {
            logger.error('PostgreSQL pool error', { error: err.message });
        });
        pool.on('connect', () => {
            logger.debug('New PostgreSQL client connected');
        });
    }
    return pool;
}

export async function query(text, params = []) {
    const p = getPool();
    const start = Date.now();
    try {
        const result = await p.query(text, params);
        const duration = Date.now() - start;
        logger.debug('DB query', { duration, rows: result.rowCount, query: text.slice(0, 100) });
        return result;
    } catch (err) {
        logger.error('DB query failed', { error: err.message, query: text.slice(0, 100) });
        throw err;
    }
}

export async function getClient() {
    return getPool().connect();
}

export async function healthCheck() {
    if (!config.databaseUrl) {
        return { connected: false, serverTime: null };
    }
    const result = await query('SELECT NOW() as now');
    return { connected: true, serverTime: result.rows[0].now };
}

export async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        logger.info('Database pool closed');
    }
}

export function hasDatabase() {
    return !!config.databaseUrl;
}
