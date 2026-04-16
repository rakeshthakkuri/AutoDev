// Usage tracking removed — no database. All generation requests are allowed.

/**
 * @returns {Promise<{ ok: boolean, used: number, limit: number | null }>}
 */
export async function checkGenerationLimit(_userId) {
    return { ok: true, used: 0, limit: null };
}

/**
 * No-op without a database.
 */
export async function recordUsageEvent(_params) {}
