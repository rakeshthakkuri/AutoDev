import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RetryHandler } from '../../src/services/retry.js';

describe('RetryHandler', () => {
    describe('retryWithFeedback', () => {
        it('returns success on first attempt when generation returns valid code', async () => {
            const handler = new RetryHandler(3, 10, 100);
            const result = await handler.retryWithFeedback(
                async () => ({ code: 'const x = 10;', error: null }),
                'prompt',
                'file.js'
            );
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.code, 'const x = 10;');
        });

        it('returns failure when code is too short', async () => {
            const handler = new RetryHandler(2, 5, 50);
            const result = await handler.retryWithFeedback(
                async () => ({ code: 'short', error: null }),
                'prompt',
                'file.js'
            );
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.error, 'Max retries exceeded');
        });

        it('retries on empty code and eventually fails', async () => {
            const handler = new RetryHandler(2, 5, 50);
            let calls = 0;
            const result = await handler.retryWithFeedback(
                async () => {
                    calls++;
                    return { code: '', error: 'empty' };
                },
                'prompt',
                'file.js'
            );
            assert.strictEqual(result.success, false);
            assert.ok(calls >= 2);
        });

        it('succeeds on second attempt', async () => {
            const handler = new RetryHandler(3, 5, 50);
            let attempt = 0;
            const result = await handler.retryWithFeedback(
                async () => {
                    attempt++;
                    if (attempt === 1) return { code: 'x', error: null };
                    return { code: 'function test() { return true; }', error: null };
                },
                'prompt',
                'file.js'
            );
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.code, 'function test() { return true; }');
        });
    });
});
