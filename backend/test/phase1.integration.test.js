/**
 * Phase 1 integration — basic HTTP checks (BUILD_CHECK skips listen).
 */
process.env.BUILD_CHECK = '1';

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

let request;
let app;

before(async () => {
    const supertest = (await import('supertest')).default;
    const mod = await import('../src/index.js');
    app = mod.app;
    request = supertest(app);
});

describe('Phase 1 HTTP surface', () => {
    test('GET /health includes v1Deprecated and agentVersion v2', async () => {
        const res = await request.get('/health');
        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'ok');
        assert.equal(res.body.agentVersion, 'v2');
        assert.equal(res.body.v1Deprecated, true);
    });

    test('legacy /api routes receive Deprecation headers', async () => {
        const res = await request.post('/api/analyze').send({});
        assert.equal(res.headers.deprecation, 'true');
        assert.ok(res.headers.sunset);
    });

    test('GET /v1/projects without auth returns 401', async () => {
        const res = await request.get('/v1/projects');
        assert.equal(res.status, 401);
    });
});
