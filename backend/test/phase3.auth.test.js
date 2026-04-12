/**
 * Phase 3 auth — requires DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET and migrated schema.
 */
process.env.BUILD_CHECK = '1';

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

const hasAuthDb = Boolean(
    process.env.DATABASE_URL
    && process.env.JWT_SECRET
    && process.env.JWT_REFRESH_SECRET,
);

let request;
let app;

before(async () => {
    const supertest = (await import('supertest')).default;
    const mod = await import('../src/index.js');
    app = mod.app;
    request = supertest(app);
});

describe('Phase 3 auth', { skip: !hasAuthDb }, () => {
    test('register, login, me, api-keys lifecycle', async () => {
        const email = `u_${Date.now()}@example.com`;
        const password = 'password123';

        const reg = await request.post('/auth/register').send({ email, password });
        assert.equal(reg.status, 201, reg.text);
        assert.ok(reg.body.access);
        assert.ok(reg.body.refresh);

        const me = await request.get('/auth/me').set('Authorization', `Bearer ${reg.body.access}`);
        assert.equal(me.status, 200);
        assert.equal(me.body.email, email);

        const keys = await request.post('/auth/api-keys').set('Authorization', `Bearer ${reg.body.access}`).send({ name: 't' });
        assert.equal(keys.status, 201);
        assert.ok(keys.body.key?.startsWith('sk_'));

        const list = await request.get('/auth/api-keys').set('Authorization', `Bearer ${reg.body.access}`);
        assert.equal(list.status, 200);
        assert.ok(Array.isArray(list.body.keys));

        const del = await request.delete(`/auth/api-keys/${keys.body.id}`).set('Authorization', `Bearer ${reg.body.access}`);
        assert.equal(del.status, 200);
    });

    test('v1 generate without auth returns 401', async () => {
        const res = await request.post('/v1/generate').send({
            prompt: 'x',
            requirements: { framework: 'vanilla-js', stylingFramework: 'plain-css', complexity: 'simple' },
            plan: { files: [{ path: 'index.html' }] },
        });
        assert.equal(res.status, 401);
    });
});
