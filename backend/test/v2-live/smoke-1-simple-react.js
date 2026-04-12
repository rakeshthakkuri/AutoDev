// ═══════════════════════════════════════════════════════════════════════════════
// Smoke Test 1 — Simple React Portfolio (Real Gemini Calls)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Prompt: Personal portfolio page with hero, about me, project showcase grid
// Framework: React + Tailwind | Complexity: Simple
//
// Run: node --test backend/test/v2-live/smoke-1-simple-react.js
// Requires: GEMINI_API_KEY in .env
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { LiveTestRunner } from './smoke-runner.js';

const PROMPT = 'Build a simple personal portfolio page with a hero section, about me section, and a project showcase grid';
const FRAMEWORK = 'react';
const STYLING = 'tailwind';
const COMPLEXITY = 'simple';

let runner;
let result;

describe('Smoke Test 1: Simple React Portfolio', { timeout: 360_000 }, () => {

    before(async () => {
        runner = new LiveTestRunner({ timeout: 240_000 });
        await runner.setup();

        console.log('\n🚀 Starting generation...');
        console.log(`   Prompt: "${PROMPT}"`);
        console.log(`   Framework: ${FRAMEWORK} | Styling: ${STYLING} | Complexity: ${COMPLEXITY}\n`);

        result = await runner.generate(PROMPT, {
            framework: FRAMEWORK,
            styling: STYLING,
            complexity: COMPLEXITY,
        });

        runner.printSummary(result);
    });

    after(async () => {
        await runner.teardown();
    });

    // ── PIPELINE HEALTH ──────────────────────────────────────────────────

    describe('Pipeline Health', () => {
        it('1. No generation_error events', () => {
            const errors = result.events.filter(e => e.type === 'generation_error');
            assert.equal(errors.length, 0, `Found ${errors.length} error events: ${JSON.stringify(errors.map(e => e.data))}`);
        });

        it('2. generation_complete event received', () => {
            const complete = result.events.find(e => e.type === 'generation_complete');
            assert.ok(complete, 'No generation_complete event found');
        });

        it('3. Duration under 3 minutes', () => {
            assert.ok(result.duration < 180_000, `Duration was ${(result.duration / 1000).toFixed(1)}s (limit: 180s)`);
        });

        it('4. All SSE events have valid JSON payloads', () => {
            const invalid = result.events.filter(e => e.parseError);
            assert.equal(invalid.length, 0, `Found ${invalid.length} events with invalid JSON: ${invalid.map(e => e.raw?.substring(0, 80))}`);
        });
    });

    // ── PLAN QUALITY ─────────────────────────────────────────────────────

    describe('Plan Quality', () => {
        it('5. Plan includes at least 4 files', () => {
            const planFiles = result.plan?.files || [];
            assert.ok(planFiles.length >= 4, `Plan has ${planFiles.length} files (expected >= 4)`);
        });

        it('6. Plan includes an entry point (App.jsx or similar)', () => {
            const planFiles = (result.plan?.files || []).map(f => f.path || f);
            const hasEntry = planFiles.some(p =>
                p.includes('App.') || p.includes('app.') ||
                p.includes('main.') || p.includes('index.html') ||
                p.includes('page.')
            );
            assert.ok(hasEntry, `No entry point found in plan: ${planFiles.join(', ')}`);
        });

        it('7. Plan includes at least one component file', () => {
            const planFiles = (result.plan?.files || []).map(f => f.path || f);
            const hasComponent = planFiles.some(p =>
                p.includes('components/') || p.includes('Components/') ||
                p.includes('sections/') || p.includes('Sections/') ||
                (p.endsWith('.jsx') || p.endsWith('.tsx')) // Any JSX file is effectively a component
            );
            assert.ok(hasComponent, `No component file found in plan: ${planFiles.join(', ')}`);
        });

        it('8. Plan includes a CSS/style file', () => {
            const planFiles = (result.plan?.files || []).map(f => f.path || f);
            const hasStyle = planFiles.some(p =>
                p.endsWith('.css') || p.endsWith('.scss') ||
                p.includes('tailwind') || p.includes('style') ||
                p.includes('global')
            );
            assert.ok(hasStyle, `No style file found in plan: ${planFiles.join(', ')}`);
        });

        it('9. No plan validation errors (or resolved by revision)', () => {
            // The v2 pipeline auto-revises plans, so we check the final plan is usable
            const planFiles = result.plan?.files || [];
            assert.ok(planFiles.length > 0, 'Plan has no files');
        });
    });

    // ── CODE QUALITY ─────────────────────────────────────────────────────

    describe('Code Quality', () => {
        it('10. Every .jsx component file has a valid default export', () => {
            // Exclude entry points (main.jsx, index.jsx) — they mount the app, not export components
            const jsxFiles = Object.entries(result.files).filter(([p]) =>
                (p.endsWith('.jsx') || p.endsWith('.tsx')) &&
                !p.includes('main.') && !p.match(/^(src\/)?index\./)
            );
            const failures = [];

            for (const [filePath, content] of jsxFiles) {
                const contracts = runner.extractContracts(content, filePath);
                if (!contracts.defaultExport) {
                    failures.push(`${filePath}: no default export found`);
                }
            }

            if (failures.length > 0) {
                // Print failing files for debugging
                for (const [filePath, content] of jsxFiles) {
                    const contracts = runner.extractContracts(content, filePath);
                    if (!contracts.defaultExport) {
                        console.log(`\n--- FAILING FILE: ${filePath} ---`);
                        console.log(content.split('\n').slice(0, 50).join('\n'));
                        console.log(`--- Contracts: ${JSON.stringify(contracts)} ---\n`);
                    }
                }
            }

            assert.equal(failures.length, 0, `Missing default exports:\n  ${failures.join('\n  ')}`);
        });

        it('11. No file has status "failed"', () => {
            const failed = Object.entries(result.fileStatuses || {}).filter(([, s]) => s.status === 'failed');
            assert.equal(failed.length, 0, `Failed files: ${failed.map(([p]) => p).join(', ')}`);
        });

        it('12. Every file starts with actual code (not AI filler)', () => {
            const failures = [];

            for (const [filePath, content] of Object.entries(result.files)) {
                if (!content) {
                    failures.push(`${filePath}: empty content`);
                    continue;
                }
                const firstLine = content.trim().split('\n')[0].toLowerCase();
                if (firstLine.startsWith('sure') || firstLine.startsWith('here') ||
                    firstLine.startsWith('certainly') || firstLine.startsWith('of course') ||
                    firstLine.startsWith('```')) {
                    failures.push(`${filePath}: starts with "${firstLine.substring(0, 60)}"`);
                }
            }

            assert.equal(failures.length, 0, `Files with AI filler:\n  ${failures.join('\n  ')}`);
        });

        it('13. All imports between project files resolve to generated files', () => {
            const generatedPaths = Object.keys(result.files);
            const failures = [];

            for (const [filePath, content] of Object.entries(result.files)) {
                if (!filePath.match(/\.(jsx?|tsx?)$/)) continue;

                // Find local imports (./xxx or ../xxx)
                const importRe = /import\s+.*?from\s+['"](\.\/[^'"]+|\.\.\/[^'"]+)['"]/g;
                let match;
                while ((match = importRe.exec(content)) !== null) {
                    const importPath = match[1];
                    // Resolve relative to the file's directory
                    const dir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
                    let resolved = resolveImportPath(dir, importPath);

                    // Check if resolved path matches any generated file (with extension guessing)
                    const found = generatedPaths.some(p =>
                        p === resolved ||
                        p === resolved + '.jsx' ||
                        p === resolved + '.tsx' ||
                        p === resolved + '.js' ||
                        p === resolved + '.ts' ||
                        p === resolved + '.css' ||
                        p === resolved + '/index.jsx' ||
                        p === resolved + '/index.tsx' ||
                        p === resolved + '/index.js'
                    );

                    if (!found) {
                        failures.push(`${filePath}: imports "${importPath}" → resolved "${resolved}" not found`);
                    }
                }
            }

            if (failures.length > 0) {
                console.log(`\nGenerated files: ${generatedPaths.join(', ')}`);
            }

            assert.equal(failures.length, 0, `Broken imports:\n  ${failures.join('\n  ')}`);
        });
    });

    // ── BUNDLE HEALTH ────────────────────────────────────────────────────

    describe('Bundle Health', () => {
        let bundleResult;

        before(async () => {
            if (Object.keys(result.files).length > 0) {
                bundleResult = await runner.bundle(result.files);
            }
        });

        it('14. Bundle request succeeds', () => {
            assert.ok(bundleResult, 'No bundle result (no files were generated)');
            assert.ok(!bundleResult.errors?.length || bundleResult.success, `Bundle failed: ${bundleResult.errors?.join(', ')}`);
        });

        it('15. Bundle has no errors', () => {
            assert.ok(bundleResult, 'No bundle result');
            assert.equal((bundleResult.errors || []).length, 0, `Bundle errors: ${bundleResult.errors?.join(', ')}`);
        });

        it('16. Bundle HTML contains <div id="root">', () => {
            assert.ok(bundleResult?.html, 'No bundle HTML');
            assert.ok(bundleResult.html.includes('id="root"'), 'Missing <div id="root"> in bundle HTML');
        });

        it('17. Bundle HTML references Tailwind', () => {
            assert.ok(bundleResult?.html, 'No bundle HTML');
            assert.ok(
                bundleResult.html.includes('tailwind') || bundleResult.html.includes('Tailwind'),
                'Missing Tailwind reference in bundle HTML'
            );
        });
    });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveImportPath(fromDir, importPath) {
    const parts = (fromDir ? fromDir + '/' + importPath : importPath).split('/');
    const resolved = [];
    for (const part of parts) {
        if (part === '.' || part === '') continue;
        if (part === '..') {
            resolved.pop();
        } else {
            resolved.push(part);
        }
    }
    return resolved.join('/');
}
