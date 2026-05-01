// ═══════════════════════════════════════════════════════════════════════════════
// LLM Dispatcher — owns the single pinned provider + retry loop.
// Replaces the old multi-provider router. There is exactly one provider
// active per process; chosen at startup via config.llm.primaryProvider.
// ═══════════════════════════════════════════════════════════════════════════════

import { AsyncLocalStorage } from 'node:async_hooks';
import config from '../../config.js';
import logger from '../logger.js';
import { GeminiProvider } from './providers/gemini.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { withRetry } from './retry.js';

// ─── Per-request retry-event capture ───────────────────────────────────────────
// Routes/orchestrators that want to surface retry status to the user wrap their
// work in `runWithRetryHooks(hooks, () => ...)`. Anything called inside that
// scope — anywhere in the call tree — picks up the hooks via AsyncLocalStorage.

const retryHooksStorage = new AsyncLocalStorage();

/**
 * Run `fn` with retry hooks accessible via async-local storage.
 *
 * @template T
 * @param {{ onRetry?: Function, onRecovered?: Function }} hooks
 * @param {() => Promise<T>} fn
 */
export function runWithRetryHooks(hooks, fn) {
    return retryHooksStorage.run(hooks || {}, fn);
}

function currentHooks() {
    return retryHooksStorage.getStore() || {};
}

// ─── Defensive validation ──────────────────────────────────────────────────────

function validateOptions(options, method) {
    if (options === undefined || options === null) return;
    if (typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError(
            `${method}(prompt, options) — options must be an object like { systemPrompt, temperature, maxTokens, ... }. ` +
            `Got ${typeof options} (${JSON.stringify(options).slice(0, 80)}). ` +
            `If you intended to set the system prompt, pass { systemPrompt: '...' }.`
        );
    }
}

// ─── Provider construction ─────────────────────────────────────────────────────

function buildProvider() {
    const name = config.llm.primaryProvider;
    if (name === 'gemini') return new GeminiProvider();
    if (name === 'anthropic') return new AnthropicProvider();
    throw new Error(
        `Invalid LLM_PRIMARY_PROVIDER="${name}". Set it to "gemini" or "anthropic" in your environment.`
    );
}

// ─── Dispatcher ────────────────────────────────────────────────────────────────

class LLMDispatcher {
    constructor() {
        this._provider = null;
    }

    _ensureProvider() {
        if (this._provider) return this._provider;
        this._provider = buildProvider();
        const name = this._provider.name;
        logger.info('LLM dispatcher initialized', {
            provider: name,
            model: this._provider.model || config.llm[name]?.model,
        });
        return this._provider;
    }

    get providerName() {
        return this._ensureProvider().name;
    }

    /** Eagerly construct the pinned provider. Safe to call from server startup. */
    init() {
        this._ensureProvider();
    }

    async generateCompletion(prompt, options = {}) {
        validateOptions(options, 'generateCompletion');
        const provider = this._ensureProvider();
        return withRetry(
            () => provider.generateCompletion(prompt, options),
            config.llm.retry,
            { provider: provider.name, ...currentHooks() }
        );
    }

    async generateCompletionStream(prompt, options = {}, onChunk) {
        validateOptions(options, 'generateCompletionStream');
        const provider = this._ensureProvider();
        return withRetry(
            () => provider.generateCompletionStream(prompt, options, onChunk),
            config.llm.retry,
            { provider: provider.name, ...currentHooks() }
        );
    }

    async generateFix(prompt, options = {}) {
        validateOptions(options, 'generateFix');
        const provider = this._ensureProvider();
        return withRetry(
            () => provider.generateFix(prompt, options),
            config.llm.retry,
            { provider: provider.name, ...currentHooks() }
        );
    }
}

export const llmDispatcher = new LLMDispatcher();
