import { GeminiProvider } from './providers/gemini.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import logger from '../logger.js';

/**
 * 503 UNAVAILABLE and 429 rate-limit are transient — the API asks us to retry.
 * They should NOT count as circuit-breaker failures, only as backoff triggers.
 * Hard failures (auth, invalid key, network errors) should count.
 */
function isTransientError(err) {
    const msg = String(err?.message || '');
    return (
        msg.includes('"code":503') ||
        msg.includes('"code":429') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('503') ||
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('quota') ||
        msg.includes('high demand')
    );
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

class CircuitState {
    constructor(name) {
        this.name = name;
        this.failures = 0;
        this.lastFailure = null;
        // Raised from 3 → 5: need more hard failures before opening.
        this.THRESHOLD = 5;
        // Lowered from 60s → 15s: transient spikes resolve quickly.
        this.RECOVERY_MS = 15_000;
    }

    isOpen() {
        if (this.failures < this.THRESHOLD) return false;
        if (Date.now() - this.lastFailure > this.RECOVERY_MS) {
            this.failures = 0;
            return false;
        }
        return true;
    }

    recordSuccess() { this.failures = 0; }

    recordFailure() {
        this.failures++;
        this.lastFailure = Date.now();
        if (this.failures >= this.THRESHOLD) {
            logger.warn(`Circuit breaker OPEN for provider: ${this.name}`);
        }
    }
}

class LLMRouter {
    constructor() {
        this.providers = [
            new GeminiProvider(),
            new OpenAIProvider(),
            new AnthropicProvider(),
        ].filter(p => p.isAvailable());

        this.circuits = Object.fromEntries(
            this.providers.map(p => [p.name, new CircuitState(p.name)]),
        );

        if (this.providers.length === 0) {
            // `npm run build` / Docker image build runs check-build.mjs with BUILD_CHECK=1; secrets are not available then.
            if (process.env.BUILD_CHECK === '1') {
                logger.warn('BUILD_CHECK: no LLM API keys loaded (expected during image build)');
            } else {
                throw new Error('No LLM providers available. Set GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.');
            }
        } else {
            logger.info('LLM providers available', { providers: this.providers.map(p => p.name) });
        }
    }

    async _withFallback(method, ...args) {
        if (this.providers.length === 0) {
            throw new Error('No LLM providers available. Set GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.');
        }
        let lastErr = null;
        for (const provider of this.providers) {
            const circuit = this.circuits[provider.name];
            if (circuit.isOpen()) {
                logger.debug(`Skipping ${provider.name} — circuit open`);
                continue;
            }

            // For each provider, retry transient errors (503/429) with backoff
            // WITHOUT counting them as circuit failures.
            const MAX_TRANSIENT_RETRIES = 3;
            for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
                try {
                    const result = await provider[method](...args);
                    circuit.recordSuccess();
                    return result;
                } catch (err) {
                    lastErr = err;

                    if (isTransientError(err) && attempt < MAX_TRANSIENT_RETRIES) {
                        // Transient: back off and retry without tripping the circuit.
                        const delay = Math.min(1000 * Math.pow(2, attempt), 8000); // 1s, 2s, 4s
                        logger.warn(`Transient error from ${provider.name} (attempt ${attempt + 1}/${MAX_TRANSIENT_RETRIES + 1}), retrying in ${delay}ms`, { error: err.message });
                        await sleep(delay);
                        continue;
                    }

                    // Hard failure or transient retries exhausted — record for circuit.
                    circuit.recordFailure();
                    logger.warn(`Provider ${provider.name} failed on ${method}`, { error: err.message });
                    break;
                }
            }
        }
        throw lastErr || new Error('All LLM providers failed or circuit-broken.');
    }

    generateCompletion(prompt, options = {}) {
        return this._withFallback('generateCompletion', prompt, options);
    }

    generateCompletionStream(prompt, options = {}, onChunk) {
        return this._withFallback('generateCompletionStream', prompt, options, onChunk);
    }

    generateFix(prompt, options = {}) {
        return this._withFallback('generateFix', prompt, options);
    }
}

export const llmRouter = new LLMRouter();
