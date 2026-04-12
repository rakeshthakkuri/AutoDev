import { GeminiProvider } from './providers/gemini.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import logger from '../logger.js';

class CircuitState {
    constructor(name) {
        this.name = name;
        this.failures = 0;
        this.lastFailure = null;
        this.THRESHOLD = 3;
        this.RECOVERY_MS = 60_000;
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
            try {
                const result = await provider[method](...args);
                circuit.recordSuccess();
                return result;
            } catch (err) {
                lastErr = err;
                circuit.recordFailure();
                logger.warn(`Provider ${provider.name} failed on ${method}`, { error: err.message });
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
