import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, '..');
const GENERATED_DIR = path.join(BACKEND_ROOT, 'generated');
// Align with storage LocalStorage base before config loads (dotenv may set a different path).
process.env.GENERATED_DIR = GENERATED_DIR;

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';

describe('API', () => {
    let app;
    before(async () => {
        process.env.BUILD_CHECK = '1';
        const mod = await import('../src/index.js');
        app = mod.app;
    });

    // ── Health ────────────────────────────────────────────────────────────────

    describe('GET /health', () => {
        it('returns 200 and ok status', async () => {
            const res = await request(app).get('/health');
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.status, 'ok');
            assert.ok(res.body.timestamp);
            assert.ok(Array.isArray(res.body.frameworks));
            assert.ok(res.body.frameworks.length >= 8);
        });
    });

    // ── Analyze ──────────────────────────────────────────────────────────────

    describe('POST /api/analyze', () => {
        it('returns 400 when prompt is missing', async () => {
            const res = await request(app).post('/api/analyze').send({});
            assert.strictEqual(res.status, 400);
            assert.ok(res.body.error);
        });

        it('returns 400 when prompt is empty string', async () => {
            const res = await request(app).post('/api/analyze').send({ prompt: '   ' });
            assert.strictEqual(res.status, 400);
        });

        it('accepts prompt and returns 200 with analysis', async () => {
            const res = await request(app)
                .post('/api/analyze')
                .send({ prompt: 'Create a landing page' })
                .timeout(65000);
            assert.strictEqual(res.status, 200);
            assert.ok(res.body.projectType);
            assert.ok(Array.isArray(res.body.features));
            assert.ok(res.body.framework);
        });

        it('respects framework hint', async () => {
            const res = await request(app)
                .post('/api/analyze')
                .send({ prompt: 'Create a todo app', framework: 'vue', styling: 'tailwind' })
                .timeout(65000);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.framework, 'vue');
            assert.strictEqual(res.body.stylingFramework, 'tailwind');
        });

        it('detects React from prompt', async () => {
            const res = await request(app)
                .post('/api/analyze')
                .send({ prompt: 'Build a React dashboard with charts' })
                .timeout(65000);
            assert.strictEqual(res.status, 200);
            assert.ok(res.body.framework === 'react' || res.body.framework === 'react-ts');
        });
    });

    // ── Plan ─────────────────────────────────────────────────────────────────

    describe('POST /api/plan', () => {
        it('returns 400 when requirements is missing', async () => {
            const res = await request(app).post('/api/plan').send({});
            assert.strictEqual(res.status, 400);
            assert.ok(res.body.error);
        });

        it('returns plan for vanilla-js project', async () => {
            const res = await request(app)
                .post('/api/plan')
                .send({ requirements: { projectType: 'web-app', framework: 'vanilla-js', features: ['responsive'] } })
                .timeout(65000);
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body.files));
            assert.ok(res.body.files.length >= 1);
            assert.ok(res.body.files.some(f => (f.path || f).includes('index.html')));
        });

        it('returns plan for React project', async () => {
            const res = await request(app)
                .post('/api/plan')
                .send({ requirements: { projectType: 'web-app', framework: 'react', features: ['navigation', 'forms'] } })
                .timeout(65000);
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body.files));
            assert.ok(res.body.files.some(f => (f.path || f).includes('.jsx') || (f.path || f).includes('.tsx')));
        });

        it('returns plan for Vue project', async () => {
            const res = await request(app)
                .post('/api/plan')
                .send({ requirements: { projectType: 'web-app', framework: 'vue', features: ['components'] } })
                .timeout(65000);
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body.files));
            assert.ok(res.body.files.some(f => (f.path || f).includes('.vue')));
        });

        it('returns plan for Next.js project', async () => {
            const res = await request(app)
                .post('/api/plan')
                .send({ requirements: { projectType: 'web-app', framework: 'nextjs', features: ['routing'] } })
                .timeout(65000);
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body.files));
            assert.ok(res.body.files.some(f => (f.path || f).includes('page.tsx') || (f.path || f).includes('layout.tsx')));
        });
    });

    // ── Download ─────────────────────────────────────────────────────────────

    describe('GET /download/:projectId', () => {
        it('returns 400 for invalid projectId with special chars', async () => {
            const res = await request(app).get('/download/..%2Fetc');
            assert.strictEqual(res.status, 400);
        });

        it('returns 404 for non-existent project', async () => {
            const res = await request(app).get('/download/nonexistent-project-99999');
            assert.strictEqual(res.status, 404);
        });

        it('returns 200 and zip for existing project dir', async () => {
            const projectId = 'test-download-' + Date.now();
            const projectDir = path.join(GENERATED_DIR, projectId);
            if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
            fs.mkdirSync(projectDir, { recursive: true });
            fs.writeFileSync(path.join(projectDir, 'index.html'), '<!DOCTYPE html><html><body>Test</body></html>');
            try {
                const res = await request(app).get(`/download/${projectId}`).responseType('blob');
                assert.strictEqual(res.status, 200);
                assert.ok(
                    (res.headers['content-type'] && res.headers['content-type'].includes('application/zip')) ||
                    (res.headers['content-disposition'] && res.headers['content-disposition'].includes('attachment'))
                );
            } finally {
                if (fs.existsSync(path.join(projectDir, 'index.html'))) fs.unlinkSync(path.join(projectDir, 'index.html'));
                if (fs.existsSync(projectDir)) fs.rmdirSync(projectDir);
            }
        });
    });
});
