import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    LLMError,
    TransientLLMError,
    HardLLMError,
    ContentLLMError,
    classifyProviderError,
} from '../../src/services/llm/errors.js';

describe('LLMError class hierarchy', () => {
    it('TransientLLMError is an LLMError', () => {
        const err = new TransientLLMError('boom', { provider: 'gemini' });
        assert.ok(err instanceof LLMError);
        assert.ok(err instanceof TransientLLMError);
        assert.strictEqual(err.provider, 'gemini');
        assert.strictEqual(err.name, 'TransientLLMError');
    });

    it('HardLLMError is an LLMError', () => {
        const err = new HardLLMError('auth fail', { provider: 'anthropic', status: 401 });
        assert.ok(err instanceof LLMError);
        assert.strictEqual(err.status, 401);
    });

    it('ContentLLMError keeps raw + parseError', () => {
        const cause = new SyntaxError('bad JSON');
        const err = new ContentLLMError('bad json', { provider: 'gemini', raw: 'oops', parseError: cause });
        assert.strictEqual(err.raw, 'oops');
        assert.strictEqual(err.parseError, cause);
    });
});

describe('classifyProviderError', () => {
    it('passes through already-typed LLM errors', () => {
        const original = new TransientLLMError('temp', { provider: 'gemini' });
        const out = classifyProviderError(original, 'gemini');
        assert.strictEqual(out, original);
    });

    it('classifies HTTP 503 as transient', () => {
        const err = new Error('Server is unavailable');
        err.status = 503;
        const classified = classifyProviderError(err, 'gemini');
        assert.ok(classified instanceof TransientLLMError);
        assert.strictEqual(classified.status, 503);
    });

    it('classifies HTTP 429 as transient', () => {
        const err = new Error('rate limit exceeded');
        err.status = 429;
        const classified = classifyProviderError(err, 'anthropic');
        assert.ok(classified instanceof TransientLLMError);
    });

    it('classifies HTTP 401 as hard', () => {
        const err = new Error('unauthorized');
        err.status = 401;
        const classified = classifyProviderError(err, 'gemini');
        assert.ok(classified instanceof HardLLMError);
    });

    it('classifies HTTP 403 as hard', () => {
        const err = new Error('forbidden');
        err.status = 403;
        const classified = classifyProviderError(err, 'anthropic');
        assert.ok(classified instanceof HardLLMError);
    });

    it('classifies "high demand" message as transient (no status)', () => {
        const err = new Error('This model is currently experiencing high demand. Please try again later.');
        const classified = classifyProviderError(err, 'gemini');
        assert.ok(classified instanceof TransientLLMError);
    });

    it('classifies UNAVAILABLE message as transient', () => {
        const err = new Error('{"error":{"code":503,"message":"unavailable","status":"UNAVAILABLE"}}');
        const classified = classifyProviderError(err, 'gemini');
        assert.ok(classified instanceof TransientLLMError);
    });

    it('classifies "API key" message as hard', () => {
        const err = new Error('Invalid API key provided');
        const classified = classifyProviderError(err, 'gemini');
        assert.ok(classified instanceof HardLLMError);
    });

    it('classifies network ECONNRESET as transient', () => {
        const err = new Error('socket hang up — ECONNRESET');
        const classified = classifyProviderError(err, 'anthropic');
        assert.ok(classified instanceof TransientLLMError);
    });

    it('falls back to transient for unknown errors (give them one chance)', () => {
        const err = new Error('weird unknown thing');
        const classified = classifyProviderError(err, 'gemini');
        assert.ok(classified instanceof TransientLLMError);
    });

    it('extracts status from response.status', () => {
        const err = new Error('something');
        err.response = { status: 502 };
        const classified = classifyProviderError(err, 'gemini');
        assert.ok(classified instanceof TransientLLMError);
        assert.strictEqual(classified.status, 502);
    });
});
