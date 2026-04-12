/**
 * generationStore — persistent generation job state (PostgreSQL) with in-memory fallback.
 */
import { query } from '../db/index.js';
import config from '../config.js';
import logger from './logger.js';
import { Errors } from '../utils/errors.js';

function rowToRecord(row) {
    if (!row) return null;
    const storagePath = row.storage_path;
    return {
        jobId: row.job_id,
        sessionId: row.session_id,
        prompt: row.prompt,
        status: row.status,
        progress: row.progress,
        filesGenerated: row.files_generated,
        totalFiles: row.total_files,
        errorMessage: row.error_message,
        agentVersion: row.agent_version,
        storagePath,
        downloadUrl: storagePath ? `/download/${storagePath}` : undefined,
        userId: row.user_id,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    };
}

async function dbCreate(jobId, sessionId, prompt, totalFiles = 0, opts = {}) {
    const {
        requirements = null,
        plan = null,
        userId = null,
        apiKeyId = null,
    } = opts;
    try {
        const { rows } = await query(
            `INSERT INTO projects (job_id, session_id, prompt, status, total_files, requirements, plan, user_id, api_key_id)
             VALUES ($1, $2, $3, 'pending', $4, $5::jsonb, $6::jsonb, $7, $8)
             RETURNING *`,
            [
                jobId,
                sessionId,
                prompt,
                totalFiles,
                requirements ?? null,
                plan ?? null,
                userId,
                apiKeyId,
            ],
        );
        return rowToRecord(rows[0]);
    } catch (err) {
        if (err && err.code === '23505') {
            throw Errors.conflict('A generation is already in progress for this session');
        }
        throw err;
    }
}

async function dbUpdate(jobId, patch) {
    const allowed = {
        status: 'status',
        progress: 'progress',
        filesGenerated: 'files_generated',
        totalFiles: 'total_files',
        errorMessage: 'error_message',
        storagePath: 'storage_path',
        agentVersion: 'agent_version',
    };
    const sets = [];
    const values = [];
    let i = 1;
    for (const [key, col] of Object.entries(allowed)) {
        if (patch[key] !== undefined) {
            sets.push(`${col} = $${i++}`);
            values.push(patch[key]);
        }
    }
    if (!sets.length) return dbGet(jobId);
    values.push(jobId);
    const { rows } = await query(
        `UPDATE projects SET ${sets.join(', ')} WHERE job_id = $${i} RETURNING *`,
        values,
    );
    return rowToRecord(rows[0]);
}

async function dbGet(jobId) {
    const { rows } = await query(
        'SELECT * FROM projects WHERE job_id = $1',
        [jobId],
    );
    return rowToRecord(rows[0] || null);
}

const memStore = new Map();

function memCreate(jobId, sessionId, prompt, totalFiles = 0, opts = {}) {
    const record = {
        jobId,
        sessionId,
        prompt,
        status: 'pending',
        progress: 0,
        filesGenerated: 0,
        totalFiles,
        errorMessage: null,
        agentVersion: 'v2',
        storagePath: undefined,
        downloadUrl: undefined,
        userId: opts.userId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    memStore.set(jobId, record);
    return record;
}

function memUpdate(jobId, patch) {
    const existing = memStore.get(jobId);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    if (patch.storagePath) {
        updated.downloadUrl = `/download/${patch.storagePath}`;
    }
    memStore.set(jobId, updated);
    return updated;
}

function memGet(jobId) {
    return memStore.get(jobId) || null;
}

const useDb = !!config.databaseUrl;
if (!useDb) logger.warn('DATABASE_URL not set — generationStore using in-memory fallback');

/**
 * @param {object} [opts]
 * @param {object} [opts.requirements]
 * @param {object} [opts.plan]
 * @param {string} [opts.userId]
 * @param {string} [opts.apiKeyId]
 */
export async function createGenerationRecord(jobId, sessionId, prompt, totalFiles = 0, opts = {}) {
    return useDb ? dbCreate(jobId, sessionId, prompt, totalFiles, opts) : memCreate(jobId, sessionId, prompt, totalFiles, opts);
}

export async function updateGenerationRecord(jobId, patch) {
    return useDb ? dbUpdate(jobId, patch) : memUpdate(jobId, patch);
}

export async function getGenerationRecord(jobId) {
    return useDb ? dbGet(jobId) : memGet(jobId);
}

/**
 * True if this session already has a job still running (async queue or in-flight).
 * Used with in-process locks so we do not enqueue duplicates after the API releases the lock post-202.
 */
export async function hasActiveGenerationForSession(sessionId) {
    if (useDb) {
        const { rows } = await query(
            `SELECT 1 FROM projects
             WHERE session_id = $1 AND status IN ('pending', 'generating')
             LIMIT 1`,
            [sessionId],
        );
        return rows.length > 0;
    }
    for (const r of memStore.values()) {
        if (r.sessionId === sessionId && (r.status === 'pending' || r.status === 'generating')) {
            return true;
        }
    }
    return false;
}
