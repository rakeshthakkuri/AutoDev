/**
 * Phase 0 smoke tests — requires backend running on PORT (default 5001).
 * Run: npm run test:smoke
 */

import { randomUUID } from 'crypto';

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5001';

function isUuid(s) {
    return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

async function test(name, fn) {
    try {
        await fn();
        console.log(`PASS: ${name}`);
    } catch (e) {
        console.error(`FAIL: ${name} — ${e.message}`);
        throw e;
    }
}

async function run() {
    await test('GET /health returns 200 with status ok, agentVersion, uptime', async () => {
        const res = await fetch(`${BASE}/health`);
        assert(res.ok, `expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.status === 'ok', `expected status ok, got ${body.status}`);
        assert(typeof body.agentVersion === 'string', 'missing agentVersion');
        assert(typeof body.uptime === 'number', 'missing uptime');
    });

    await test('GET /health includes x-request-id header', async () => {
        const res = await fetch(`${BASE}/health`);
        const id = res.headers.get('x-request-id');
        assert(id && isUuid(id), `expected UUID x-request-id, got ${id}`);
    });

    await test('POST /api/analyze empty body returns BAD_REQUEST + structured error', async () => {
        const res = await fetch(`${BASE}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });
        assert(res.status === 400, `expected 400, got ${res.status}`);
        const body = await res.json();
        assert(body.code === 'BAD_REQUEST', `expected BAD_REQUEST, got ${body.code}`);
        assert(body.error, 'missing error');
        assert(body.requestId && isUuid(body.requestId), 'requestId must be UUID');
        assert(body.timestamp, 'missing timestamp');
    });

    await test('POST /api/generate duplicate session returns CONFLICT', async () => {
        const session = randomUUID();
        const payload = JSON.stringify({
            prompt: 'test',
            requirements: { framework: 'vanilla-js', stylingFramework: 'plain-css', complexity: 'simple' },
            plan: { files: [{ path: 'index.html', purpose: 'page' }] },
        });
        const p1 = fetch(`${BASE}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Session-Id': session },
            body: payload,
        });
        const p2 = fetch(`${BASE}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Session-Id': session },
            body: payload,
        });
        const [r1, r2] = await Promise.all([p1, p2]);
        async function readJsonIfJson(res) {
            const ct = res.headers.get('content-type') || '';
            if (!ct.includes('application/json')) {
                await res.body?.cancel?.().catch(() => {});
                return {};
            }
            return res.json().catch(() => ({}));
        }
        const bodies = await Promise.all([readJsonIfJson(r1), readJsonIfJson(r2)]);
        const conflict = bodies.find(b => b.code === 'CONFLICT');
        assert(conflict, `expected one CONFLICT, got ${JSON.stringify(bodies)}`);
        assert(conflict.requestId && isUuid(conflict.requestId), 'CONFLICT must have UUID requestId');
    });

    await test('GET /api/generate/unknown-id/status returns NOT_FOUND', async () => {
        const res = await fetch(`${BASE}/api/generate/00000000-0000-4000-8000-000000000099/status`);
        assert(res.status === 404, `expected 404, got ${res.status}`);
        const body = await res.json();
        assert(body.code === 'NOT_FOUND', `expected NOT_FOUND, got ${body.code}`);
        assert(body.requestId && isUuid(body.requestId), 'requestId must be UUID');
    });

    await test('Error responses use UUID requestIds', async () => {
        const checks = [
            fetch(`${BASE}/api/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
            }).then(r => r.json()),
            fetch(`${BASE}/api/generate/00000000-0000-4000-8000-000000000088/status`).then(r => r.json()),
        ];
        const out = await Promise.all(checks);
        for (const body of out) {
            assert(body.requestId && isUuid(body.requestId), `bad requestId: ${body.requestId}`);
        }
    });
}

run()
    .then(() => {
        console.log('All smoke tests passed');
        process.exit(0);
    })
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
