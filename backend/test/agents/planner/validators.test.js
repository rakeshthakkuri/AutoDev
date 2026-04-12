import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validatePlan } from '../../../src/agents/planner/validators.js';

describe('validatePlan', () => {
    it('passes a valid React simple plan', () => {
        const plan = {
            files: [
                { path: 'index.html', purpose: 'HTML entry' },
                { path: 'src/main.jsx', purpose: 'React mount' },
                { path: 'src/App.jsx', purpose: 'Main component' },
                { path: 'src/index.css', purpose: 'Styles' },
                { path: 'package.json', purpose: 'Dependencies' },
            ],
        };
        const result = validatePlan(plan, { framework: 'react', complexity: 'simple' });
        assert.strictEqual(result.valid, true, 'Should be valid: ' + JSON.stringify(result.errors));
        assert.strictEqual(result.errors.length, 0);
    });

    it('fails when entry point is missing', () => {
        const plan = {
            files: [
                { path: 'index.html', purpose: 'HTML' },
                { path: 'src/index.css', purpose: 'Styles' },
                { path: 'package.json', purpose: 'Deps' },
            ],
        };
        const result = validatePlan(plan, { framework: 'react', complexity: 'simple' });
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.type === 'MISSING_ENTRY'));
    });

    it('fails when file count is below minimum', () => {
        const plan = {
            files: [
                { path: 'src/App.jsx', purpose: 'App' },
                { path: 'package.json', purpose: 'Deps' },
            ],
        };
        const result = validatePlan(plan, { framework: 'react', complexity: 'simple' });
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.type === 'FILE_COUNT_MISMATCH'));
    });

    it('fails when file count exceeds maximum for complexity', () => {
        const files = Array.from({ length: 25 }, (_, i) => ({ path: `src/file${i}.jsx`, purpose: '' }));
        files.push({ path: 'src/App.jsx', purpose: 'App' });
        const result = validatePlan({ files }, { framework: 'react', complexity: 'simple' });
        assert.ok(result.errors.some(e => e.type === 'FILE_COUNT_MISMATCH'));
    });

    it('fails on duplicate paths', () => {
        const plan = {
            files: [
                { path: 'src/App.jsx', purpose: 'A' },
                { path: 'src/App.jsx', purpose: 'B' },
                { path: 'src/main.jsx', purpose: 'C' },
                { path: 'package.json', purpose: 'D' },
            ],
        };
        const result = validatePlan(plan, { framework: 'react', complexity: 'simple' });
        assert.ok(result.errors.some(e => e.type === 'DUPLICATE_FILE'));
    });

    it('fails on invalid paths (path traversal)', () => {
        const plan = {
            files: [
                { path: '../../../etc/passwd', purpose: 'hack' },
                { path: 'src/App.jsx', purpose: 'App' },
                { path: 'src/main.jsx', purpose: 'Main' },
                { path: 'package.json', purpose: 'D' },
            ],
        };
        const result = validatePlan(plan, { framework: 'react', complexity: 'simple' });
        assert.ok(result.errors.some(e => e.type === 'INVALID_PATH'));
    });

    it('fails for Next.js plan missing layout', () => {
        const plan = {
            files: [
                { path: 'app/page.tsx', purpose: 'Page' },
                { path: 'src/index.css', purpose: 'Styles' },
                { path: 'package.json', purpose: 'Deps' },
                { path: 'next.config.js', purpose: 'Config' },
            ],
        };
        const result = validatePlan(plan, { framework: 'nextjs', complexity: 'simple' });
        assert.ok(result.errors.some(e => e.message.includes('layout')));
    });

    it('warns when package.json missing for framework project', () => {
        const plan = {
            files: [
                { path: 'src/App.jsx', purpose: 'App' },
                { path: 'src/main.jsx', purpose: 'Main' },
                { path: 'index.html', purpose: 'HTML' },
            ],
        };
        const result = validatePlan(plan, { framework: 'react', complexity: 'simple' });
        assert.ok(result.warnings.some(w => w.message.includes('package.json')));
    });

    it('passes vanilla-js without package.json', () => {
        const plan = {
            files: [
                { path: 'index.html', purpose: 'HTML' },
                { path: 'styles.css', purpose: 'Styles' },
                { path: 'script.js', purpose: 'JS' },
            ],
        };
        const result = validatePlan(plan, { framework: 'vanilla-js', complexity: 'simple' });
        assert.strictEqual(result.valid, true, JSON.stringify(result.errors));
    });
});
