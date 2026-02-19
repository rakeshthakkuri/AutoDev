// ═══════════════════════════════════════════════════════════════════════════════
// Retry Handler with Circuit Breaker + Exponential Backoff + Jitter
// ═══════════════════════════════════════════════════════════════════════════════

import config from '../config.js';
import logger from './logger.js';

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
            logger.warn(`Circuit breaker OPEN after ${this.failureCount} failures. Will retry in ${this.resetTimeoutMs / 1000}s.`);
        }
    }

    getState() {
        return this.state;
    }
}

export class RetryHandler {
    constructor(maxRetries = config.generation.maxRetries, initialDelay = 2000, maxDelay = 15000) {
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
     */
    async retryWithFeedback(generationFunc, prompt, filePath) {
        // Iterative (not recursive) to avoid stack growth with large maxRetries
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            // Check circuit breaker before each attempt
            if (!this.circuitBreaker.canExecute()) {
                logger.warn(`Circuit breaker OPEN — skipping retry for ${filePath}`);
                return { success: false, error: 'Circuit breaker open — API is overloaded' };
            }

            if (attempt > 0) {
                const delay = this._getDelay(attempt);
                logger.info(`Retry ${attempt + 1}/${this.maxRetries} for ${filePath} after ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            try {
                const result = await generationFunc(prompt);

                if (result.code && result.code.length > 10) {
                    const hasValidCode = this._validateCodeContent(result.code, filePath);
                    if (hasValidCode) {
                        this.circuitBreaker.recordSuccess();
                        return { success: true, code: result.code };
                    }
                    logger.info(`Code content validation failed for ${filePath}, retrying...`);
                }
                // Empty/invalid result — loop to next attempt
            } catch (e) {
                this.circuitBreaker.recordFailure();

                if (e.message?.includes('429') || e.message?.includes('rate limit')) {
                    logger.warn(`Rate limited for ${filePath}. Waiting longer before retry.`);
                    await new Promise(resolve => setTimeout(resolve, 10000));
                }
                // Loop to next attempt
            }
        }

        return { success: false, error: `Max retries (${this.maxRetries}) exceeded for ${filePath}` };
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
