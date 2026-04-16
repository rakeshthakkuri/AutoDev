/**
 * generationStore — in-memory generation job state.
 */
import logger from './logger.js';

logger.info('generationStore: using in-memory store');

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

/**
 * @param {object} [opts]
 * @param {object} [opts.requirements]
 * @param {object} [opts.plan]
 * @param {string} [opts.userId]
 * @param {string} [opts.apiKeyId]
 */
export async function createGenerationRecord(jobId, sessionId, prompt, totalFiles = 0, opts = {}) {
    return memCreate(jobId, sessionId, prompt, totalFiles, opts);
}

export async function updateGenerationRecord(jobId, patch) {
    return memUpdate(jobId, patch);
}

export async function getGenerationRecord(jobId) {
    return memGet(jobId);
}

export async function hasActiveGenerationForSession(sessionId) {
    for (const r of memStore.values()) {
        if (r.sessionId === sessionId && (r.status === 'pending' || r.status === 'generating')) {
            return true;
        }
    }
    return false;
}
