const locks = new Map(); // key -> { acquiredAt: number, ttlMs: number }

export async function acquireLock(key, ttlMs = 300_000) {
    const now = Date.now();
    for (const [k, v] of locks.entries()) {
        if (now - v.acquiredAt > v.ttlMs) locks.delete(k);
    }

    if (locks.has(key)) return false;
    locks.set(key, { acquiredAt: now, ttlMs });
    return true;
}

export async function releaseLock(key) {
    locks.delete(key);
}

export async function isLocked(key) {
    const lock = locks.get(key);
    if (!lock) return false;
    if (Date.now() - lock.acquiredAt > lock.ttlMs) {
        locks.delete(key);
        return false;
    }
    return true;
}

/** @type {'memory'} */
export const LOCK_BACKEND = 'memory';
