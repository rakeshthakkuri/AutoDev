// ═══════════════════════════════════════════════════════════════════════════════
// Retry policy for the single pinned provider.
// Transient → exponential backoff with jitter (capped). Hard → propagate immediately.
// Content errors are propagated to the caller — they need different prompting,
// not a blind same-prompt retry, so the dispatcher leaves that to the caller layer
// (planner, coder) which can rewrite the prompt before retrying.
// ═══════════════════════════════════════════════════════════════════════════════

import logger from '../logger.js';
import { TransientLLMError, HardLLMError, ContentLLMError, classifyProviderError } from './errors.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @typedef {object} RetryOptions
 * @property {number} maxAttempts        Total attempts including the first call (>= 1).
 * @property {number} initialBackoffMs   Backoff for attempt 2 (then doubles).
 * @property {number} maxBackoffMs       Hard cap on a single delay.
 * @property {number} [jitterMs]         Random jitter added on each retry.
 *
 * @typedef {object} RetryHooks
 * @property {(info: { attempt: number, maxAttempts: number, delayMs: number, error: Error, provider: string }) => void} [onRetry]
 * @property {(info: { totalDelayMs: number, attempt: number, provider: string }) => void} [onRecovered]
 */

/**
 * Run `fn` with exponential-backoff retry. Wraps unknown errors into typed LLMErrors.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {RetryOptions} options
 * @param {{ provider: string } & RetryHooks} ctx
 * @returns {Promise<T>}
 */
export async function withRetry(fn, options, ctx) {
    const { maxAttempts, initialBackoffMs, maxBackoffMs, jitterMs = 0 } = options;
    const provider = ctx?.provider || 'unknown';
    const onRetry = ctx?.onRetry;
    const onRecovered = ctx?.onRecovered;

    let totalDelayMs = 0;
    let attempt = 0;

    while (true) {
        attempt += 1;
        try {
            const result = await fn();
            if (attempt > 1) {
                onRecovered?.({ totalDelayMs, attempt, provider });
            }
            return result;
        } catch (rawErr) {
            const err = classifyProviderError(rawErr, provider);

            // Hard / Content → don't retry here. Caller decides what to do.
            if (err instanceof HardLLMError || err instanceof ContentLLMError) {
                throw err;
            }

            // Transient — check if we have budget left
            if (!(err instanceof TransientLLMError)) {
                // Defensive: classifyProviderError shouldn't return anything else, but just in case.
                throw err;
            }

            if (attempt >= maxAttempts) {
                logger.warn('LLM retry budget exhausted', {
                    provider,
                    attempts: attempt,
                    totalDelayMs,
                    error: err.message,
                });
                throw err;
            }

            const baseDelay = Math.min(maxBackoffMs, initialBackoffMs * Math.pow(2, attempt - 1));
            const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
            const delayMs = baseDelay + jitter;
            totalDelayMs += delayMs;

            logger.warn('LLM transient error — retrying', {
                provider,
                attempt,
                maxAttempts,
                delayMs,
                error: err.message,
            });
            onRetry?.({ attempt, maxAttempts, delayMs, error: err, provider });
            await sleep(delayMs);
        }
    }
}
