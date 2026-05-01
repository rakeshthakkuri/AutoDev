// ═══════════════════════════════════════════════════════════════════════════════
// Typed LLM errors — shape what the dispatcher's retry loop can decide on.
// ═══════════════════════════════════════════════════════════════════════════════

/** Base class so callers can `instanceof LLMError` */
export class LLMError extends Error {
    constructor(message, { provider, cause, status, code } = {}) {
        super(message);
        this.name = this.constructor.name;
        this.provider = provider;
        this.status = status;
        this.code = code;
        if (cause) this.cause = cause;
    }
}

/** Provider is temporarily overloaded / rate-limited / network blip — retry with backoff. */
export class TransientLLMError extends LLMError {}

/** Provider rejected the request structurally (auth, malformed, model-not-found) — do NOT retry. */
export class HardLLMError extends LLMError {}

/** HTTP succeeded but the body content is unusable (empty / truncated / invalid JSON / schema-fail). */
export class ContentLLMError extends LLMError {
    constructor(message, opts = {}) {
        super(message, opts);
        this.raw = opts.raw;            // the actual returned text, for debugging / repair prompts
        this.parseError = opts.parseError;
    }
}

// ─── Classification helpers ────────────────────────────────────────────────────

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 522, 524]);

const TRANSIENT_PATTERNS = [
    /high demand/i,
    /unavailable/i,
    /overloaded/i,
    /rate.?limit/i,
    /quota/i,
    /timeout/i,
    /timed.?out/i,
    /econnreset/i,
    /econnrefused/i,
    /enotfound/i,
    /etimedout/i,
    /socket hang up/i,
    /network error/i,
    /service.?unavailable/i,
    /server error/i,
    /try again/i,
];

const HARD_PATTERNS = [
    /api[_ ]?key/i,
    /unauthorized/i,
    /forbidden/i,
    /authentication/i,
    /invalid request/i,
    /model.+not.+found/i,
    /no such model/i,
    /permission/i,
];

/**
 * Wrap a provider-level Error into a typed LLMError. Idempotent — passes through if already typed.
 *
 * @param {Error|unknown} err
 * @param {string} provider
 * @returns {LLMError}
 */
export function classifyProviderError(err, provider) {
    if (err instanceof LLMError) return err;

    const message = String(err?.message || err || 'Unknown LLM provider error');
    const status = extractStatus(err);

    if (status && TRANSIENT_STATUS.has(status)) {
        return new TransientLLMError(message, { provider, status, cause: err });
    }
    if (status && status >= 400 && status < 500) {
        // 4xx that's not transient → hard. (401/403/404/422 etc.)
        return new HardLLMError(message, { provider, status, cause: err });
    }

    if (TRANSIENT_PATTERNS.some(re => re.test(message))) {
        return new TransientLLMError(message, { provider, status, cause: err });
    }
    if (HARD_PATTERNS.some(re => re.test(message))) {
        return new HardLLMError(message, { provider, status, cause: err });
    }

    // Unknown — treat as transient so retry is given a chance, but only once
    // (the dispatcher caps total attempts). Better than failing fast on a flake.
    return new TransientLLMError(message, { provider, status, cause: err });
}

function extractStatus(err) {
    if (!err) return null;
    if (typeof err.status === 'number') return err.status;
    if (typeof err.statusCode === 'number') return err.statusCode;
    if (err.response && typeof err.response.status === 'number') return err.response.status;
    const msg = String(err.message || '');
    const m = msg.match(/"code"\s*:\s*(\d{3})/) || msg.match(/\b(4\d{2}|5\d{2})\b/);
    return m ? parseInt(m[1], 10) : null;
}
