// API key management removed — no database to store keys.

/**
 * @returns {Promise<null>} Always null; no API keys can be stored without a database.
 */
export async function verifyApiKey(_plain) {
    return null;
}

export async function createApiKey(_userId, _name) {
    throw new Error('API keys require a database');
}

export async function listApiKeys(_userId) {
    return [];
}

export async function deleteApiKey(_userId, _keyId) {
    return false;
}
