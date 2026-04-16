// Database removed — application runs entirely without a database.

export async function query() {
    throw new Error('Database is not configured');
}

export async function getClient() {
    throw new Error('Database is not configured');
}

export async function healthCheck() {
    return { connected: false, serverTime: null };
}

export async function closePool() {}

export function hasDatabase() {
    return false;
}
