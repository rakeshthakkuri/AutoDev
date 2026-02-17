import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CircuitBreaker, RetryHandler } from '../../src/services/retry.js';

describe('CircuitBreaker', () => {
    it('starts in CLOSED state', () => {
        const cb = new CircuitBreaker();
        assert.strictEqual(cb.getState(), 'CLOSED');
        assert.strictEqual(cb.canExecute(), true);
    });

    it('opens after reaching failure threshold', () => {
        const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60000 });
        cb.recordFailure();
        cb.recordFailure();
        assert.strictEqual(cb.canExecute(), true); // still closed
        cb.recordFailure();
        assert.strictEqual(cb.getState(), 'OPEN');
        assert.strictEqual(cb.canExecute(), false);
    });

    it('resets on success', () => {
        const cb = new CircuitBreaker({ failureThreshold: 3 });
        cb.recordFailure();
        cb.recordFailure();
        cb.recordSuccess();
        assert.strictEqual(cb.getState(), 'CLOSED');
        assert.strictEqual(cb.canExecute(), true);
    });

    it('transitions to HALF_OPEN after timeout', () => {
        const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10 });
        cb.recordFailure();
        assert.strictEqual(cb.getState(), 'OPEN');
        // Wait for timeout
        return new Promise((resolve) => {
            setTimeout(() => {
                assert.strictEqual(cb.canExecute(), true);
                assert.strictEqual(cb.getState(), 'HALF_OPEN');
                resolve();
            }, 20);
        });
    });
});

describe('RetryHandler', () => {
    it('returns success on first try when generation succeeds', async () => {
        const handler = new RetryHandler(3, 100, 200);
        const result = await handler.retryWithFeedback(
            async () => ({ code: 'const hello = "world"; console.log(hello);' }),
            'test prompt',
            'app.js',
            0
        );
        assert.strictEqual(result.success, true);
        assert.ok(result.code.includes('hello'));
    });

    it('retries and returns failure after max retries', async () => {
        const handler = new RetryHandler(2, 50, 100);
        let callCount = 0;
        const result = await handler.retryWithFeedback(
            async () => { callCount++; return { code: '' }; }, // always returns empty
            'test prompt',
            'app.js',
            0
        );
        assert.strictEqual(result.success, false);
        assert.ok(callCount >= 1);
    });

    it('validates code content by file type', () => {
        const handler = new RetryHandler();
        assert.strictEqual(handler._validateCodeContent('<div>hello</div>', 'test.html'), true);
        assert.strictEqual(handler._validateCodeContent('body { color: red; }', 'test.css'), true);
        assert.strictEqual(handler._validateCodeContent('const x = 1;', 'test.js'), true);
        assert.strictEqual(handler._validateCodeContent('<template><div></div></template>', 'App.vue'), true);
        assert.strictEqual(handler._validateCodeContent('<script>let x;</script>', 'App.svelte'), true);
        assert.strictEqual(handler._validateCodeContent('---\n---\n<html></html>', 'page.astro'), true);
        assert.strictEqual(handler._validateCodeContent('{"name": "test"}', 'package.json'), true);
    });
});
