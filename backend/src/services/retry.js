// ═══════════════════════════════════════════════════════════════════════════════
// Retry Handler with Circuit Breaker + Exponential Backoff + Jitter
// ═══════════════════════════════════════════════════════════════════════════════

const STATE = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

export class CircuitBreaker {
    constructor({ failureThreshold = 5, resetTimeoutMs = 60000 } = {}) {
        this.state = STATE.CLOSED;
        this.failureCount = 0;
        this.failureThreshold = failureThreshold;
        this.resetTimeoutMs = resetTimeoutMs;
        this.lastFailureTime = 0;
    }

    canExecute() {
        if (this.state === STATE.CLOSED) return true;
        if (this.state === STATE.OPEN) {
            if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
                this.state = STATE.HALF_OPEN;
                return true;
            }
            return false;
        }
        // HALF_OPEN — allow one request through
        return true;
    }

    recordSuccess() {
        this.failureCount = 0;
        this.state = STATE.CLOSED;
    }

    recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.failureCount >= this.failureThreshold) {
            this.state = STATE.OPEN;
            console.warn(`Circuit breaker OPEN after ${this.failureCount} failures. Will retry in ${this.resetTimeoutMs / 1000}s.`);
        }
    }

    getState() {
        return this.state;
    }
}

export class RetryHandler {
    constructor(maxRetries = 3, initialDelay = 2000, maxDelay = 15000) {
        this.maxRetries = maxRetries;
        this.initialDelay = initialDelay;
        this.maxDelay = maxDelay;
        this.circuitBreaker = new CircuitBreaker({ failureThreshold: 8, resetTimeoutMs: 60000 });
    }

    /**
     * Calculate delay with exponential backoff + jitter
     */
    _getDelay(attempt) {
        const base = Math.min(this.initialDelay * Math.pow(2, attempt - 1), this.maxDelay);
        // Add 0-30% random jitter to avoid thundering herd
        const jitter = base * 0.3 * Math.random();
        return Math.round(base + jitter);
    }

    /**
     * @param {Function} generationFunc - (prompt) => Promise<{ code, error }>
     * @param {string} prompt - Original prompt
     * @param {string} filePath - For logging
     * @param {number} attempt - Current attempt (0 = first try)
     */
    async retryWithFeedback(generationFunc, prompt, filePath, attempt = 0) {
        if (attempt >= this.maxRetries) {
            return { success: false, error: `Max retries (${this.maxRetries}) exceeded for ${filePath}` };
        }

        // Check circuit breaker
        if (!this.circuitBreaker.canExecute()) {
            console.warn(`Circuit breaker OPEN — skipping retry for ${filePath}`);
            return { success: false, error: 'Circuit breaker open — API is overloaded' };
        }

        const isRetry = attempt > 0;
        if (isRetry) {
            const delay = this._getDelay(attempt);
            console.log(`Retry ${attempt + 1}/${this.maxRetries} for ${filePath} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // On retries, we still use the original prompt — the agentic fixer will
        // handle error-specific feedback after initial generation + validation.
        // This keeps the retry handler focused on LLM call reliability (network,
        // rate limits, empty responses) rather than code quality.
        try {
            const result = await generationFunc(prompt);

            if (result.code && result.code.length > 10) {
                const hasValidCode = this._validateCodeContent(result.code, filePath);
                if (hasValidCode) {
                    this.circuitBreaker.recordSuccess();
                    return { success: true, code: result.code };
                }
                console.log(`Code content validation failed for ${filePath}, retrying...`);
            }

            // Retry
            return this.retryWithFeedback(generationFunc, prompt, filePath, attempt + 1);
        } catch (e) {
            this.circuitBreaker.recordFailure();

            // If it's a rate limit or server error, don't retry immediately
            if (e.message?.includes('429') || e.message?.includes('rate limit')) {
                console.warn(`Rate limited for ${filePath}. Waiting longer before retry.`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }

            return this.retryWithFeedback(generationFunc, prompt, filePath, attempt + 1);
        }
    }

    /**
     * Validate that generated code contains expected markers
     */
    _validateCodeContent(code, filePath) {
        const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();

        switch (ext) {
            case '.html':
                return /<[a-z]+[\s>]/i.test(code);
            case '.css':
            case '.scss':
                return /[\w\-#.:,\s>+~[\]()=^$*|'"]+\s*\{[\s\S]*?\}/.test(code);
            case '.js':
            case '.mjs':
            case '.cjs':
                return /\b(function|const|let|var|class|if|for|while|=>|export|import|module)\b/.test(code) || /document\.|console\./.test(code);
            case '.jsx':
            case '.tsx':
            case '.ts':
                return /\b(function|const|let|var|class|export|import|interface|type|=>)\b/.test(code);
            case '.vue':
                return /<template/i.test(code) || /<script/i.test(code);
            case '.svelte':
                return /<script/i.test(code) || /<[a-z]/i.test(code);
            case '.astro':
                return /---/.test(code) || /<[a-z]/i.test(code);
            case '.json':
                try { JSON.parse(code); return true; } catch { return code.includes('{'); }
            default:
                return code.trim().length > 10;
        }
    }
}
