import { describe, it } from 'node:test';
import assert from 'node:assert';
import { withRetry } from '../../src/services/llm/retry.js';
import { TransientLLMError, HardLLMError, ContentLLMError } from '../../src/services/llm/errors.js';

const FAST_OPTS = { maxAttempts: 4, initialBackoffMs: 1, maxBackoffMs: 4, jitterMs: 0 };

describe('withRetry', () => {
    it('returns the result on first success', async () => {
        let calls = 0;
        const out = await withRetry(async () => { calls++; return 42; }, FAST_OPTS, { provider: 'test' });
        assert.strictEqual(out, 42);
        assert.strictEqual(calls, 1);
    });

    it('retries transient errors up to maxAttempts', async () => {
        let calls = 0;
        await assert.rejects(
            withRetry(async () => {
                calls++;
                throw new TransientLLMError('temp', { provider: 'test' });
            }, FAST_OPTS, { provider: 'test' }),
            (err) => err instanceof TransientLLMError
        );
        assert.strictEqual(calls, FAST_OPTS.maxAttempts);
    });

    it('succeeds after some transient failures', async () => {
        let calls = 0;
        const out = await withRetry(async () => {
            calls++;
            if (calls < 3) throw new TransientLLMError('temp', { provider: 'test' });
            return 'recovered';
        }, FAST_OPTS, { provider: 'test' });
        assert.strictEqual(out, 'recovered');
        assert.strictEqual(calls, 3);
    });

    it('does NOT retry hard errors', async () => {
        let calls = 0;
        await assert.rejects(
            withRetry(async () => {
                calls++;
                throw new HardLLMError('auth', { provider: 'test' });
            }, FAST_OPTS, { provider: 'test' }),
            (err) => err instanceof HardLLMError
        );
        assert.strictEqual(calls, 1);
    });

    it('does NOT retry content errors', async () => {
        let calls = 0;
        await assert.rejects(
            withRetry(async () => {
                calls++;
                throw new ContentLLMError('bad json', { provider: 'test', raw: 'x' });
            }, FAST_OPTS, { provider: 'test' }),
            (err) => err instanceof ContentLLMError
        );
        assert.strictEqual(calls, 1);
    });

    it('classifies plain Errors and retries them as transient', async () => {
        let calls = 0;
        await assert.rejects(
            withRetry(async () => {
                calls++;
                const e = new Error('Server unavailable');
                e.status = 503;
                throw e;
            }, FAST_OPTS, { provider: 'test' })
        );
        assert.strictEqual(calls, FAST_OPTS.maxAttempts);
    });

    it('fires onRetry hook for each retry', async () => {
        const events = [];
        let calls = 0;
        await withRetry(async () => {
            calls++;
            if (calls < 3) throw new TransientLLMError('temp', { provider: 'test' });
            return 'ok';
        }, FAST_OPTS, {
            provider: 'test',
            onRetry: (info) => events.push({ attempt: info.attempt, delayMs: info.delayMs }),
        });
        assert.strictEqual(events.length, 2);
        assert.strictEqual(events[0].attempt, 1);
        assert.strictEqual(events[1].attempt, 2);
    });

    it('fires onRecovered when a retry eventually succeeds', async () => {
        let recovered = null;
        let calls = 0;
        await withRetry(async () => {
            calls++;
            if (calls < 2) throw new TransientLLMError('temp', { provider: 'test' });
            return 'ok';
        }, FAST_OPTS, {
            provider: 'test',
            onRecovered: (info) => { recovered = info; },
        });
        assert.ok(recovered);
        assert.strictEqual(recovered.attempt, 2);
        assert.strictEqual(recovered.provider, 'test');
    });

    it('does NOT fire onRecovered if first call succeeds', async () => {
        let recovered = null;
        await withRetry(async () => 'ok', FAST_OPTS, {
            provider: 'test',
            onRecovered: (info) => { recovered = info; },
        });
        assert.strictEqual(recovered, null);
    });

    it('respects maxBackoffMs cap', async () => {
        const events = [];
        let calls = 0;
        const opts = { maxAttempts: 5, initialBackoffMs: 100, maxBackoffMs: 50, jitterMs: 0 };
        await assert.rejects(
            withRetry(async () => {
                calls++;
                throw new TransientLLMError('temp', { provider: 'test' });
            }, opts, {
                provider: 'test',
                onRetry: (info) => events.push(info.delayMs),
            })
        );
        // Every recorded delay should be <= maxBackoffMs (50)
        for (const d of events) assert.ok(d <= 50, `delay ${d} should be <= 50`);
    });
});
