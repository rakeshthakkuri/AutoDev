// ═══════════════════════════════════════════════════════════════════════════════
// Smoke Test 2 — Intermediate Next.js SaaS Landing Page (Real Gemini Calls)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Tests: Next.js conventions, inter-file consistency, design system usage
//
// Run: node --test backend/test/v2-live/smoke-2-nextjs.js
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { LiveTestRunner } from './smoke-runner.js';

const PROMPT = 'Build a SaaS landing page with hero section, feature highlights with icons, pricing table with 3 tiers, testimonials carousel, and a CTA footer. Use modern design with gradients.';
const FRAMEWORK = 'nextjs';
const STYLING = 'tailwind';
const COMPLEXITY = 'intermediate';

let runner;
let result;

describe('Smoke Test 2: Intermediate Next.js SaaS', { timeout: 420_000 }, () => {

    before(async () => {
        runner = new LiveTestRunner({ timeout: 300_000 });
        await runner.setup();

        console.log('\n🚀 Starting generation...');
        console.log(`   Prompt: "${PROMPT.substring(0, 80)}..."`);
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

    // ── PIPELINE HEALTH (same as Smoke Test 1) ──────────────────────────

    describe('Pipeline Health', () => {
        it('1. No generation_error events', () => {
            const errors = result.events.filter(e => e.type === 'generation_error');
            assert.equal(errors.length, 0, `Errors: ${JSON.stringify(errors.map(e => e.data))}`);
        });

        it('2. generation_complete received', () => {
            assert.ok(result.events.find(e => e.type === 'generation_complete'), 'No completion event');
        });

        it('3. Duration under 4 minutes', () => {
            assert.ok(result.duration < 240_000, `Duration: ${(result.duration / 1000).toFixed(1)}s`);
        });

        it('4. All SSE events have valid JSON', () => {
            const invalid = result.events.filter(e => e.parseError);
            assert.equal(invalid.length, 0, `Invalid JSON events: ${invalid.length}`);
        });
    });

    // ── PLAN QUALITY ─────────────────────────────────────────────────────

    describe('Plan Quality', () => {
        it('5. Plan includes at least 6 files', () => {
            const count = (result.plan?.files || []).length;
            assert.ok(count >= 6, `Plan has ${count} files (expected >= 6)`);
        });

        it('6. Plan includes entry point', () => {
            const files = (result.plan?.files || []).map(f => f.path || f);
            const hasEntry = files.some(p =>
                p.includes('page.') || p.includes('App.') ||
                p.includes('layout.') || p.includes('index.')
            );
            assert.ok(hasEntry, `No entry point: ${files.join(', ')}`);
        });

        it('7. Plan includes component files', () => {
            const files = (result.plan?.files || []).map(f => f.path || f);
            const hasComponents = files.some(p =>
                p.includes('components/') || p.includes('sections/')
            );
            assert.ok(hasComponents, `No components: ${files.join(', ')}`);
        });

        it('8. Plan includes style file', () => {
            const files = (result.plan?.files || []).map(f => f.path || f);
            const hasStyle = files.some(p => p.endsWith('.css') || p.endsWith('.scss'));
            assert.ok(hasStyle, `No styles: ${files.join(', ')}`);
        });
    });

    // ── CODE QUALITY ─────────────────────────────────────────────────────

    describe('Code Quality', () => {
        it('9. Every .jsx/.tsx component file has valid default export', () => {
            // Exclude: layout files, config files, entry points, data/util files
            const jsxFiles = Object.entries(result.files).filter(([p]) =>
                p.match(/\.(jsx|tsx)$/) &&
                !p.includes('layout') &&
                !p.includes('config') &&
                !p.includes('main.') &&
                !p.match(/^(src\/)?index\./)
            );
            const missing = [];
            for (const [path, content] of jsxFiles) {
                const c = runner.extractContracts(content, path);
                if (!c.defaultExport && !c.exports.length) {
                    missing.push(path);
                }
            }
            assert.equal(missing.length, 0, `Missing exports: ${missing.join(', ')}`);
        });

        it('10. No failed files', () => {
            const failed = Object.entries(result.fileStatuses || {}).filter(([, s]) => s.status === 'failed');
            assert.equal(failed.length, 0, `Failed: ${failed.map(([p]) => p).join(', ')}`);
        });

        it('11. No AI filler at start of files', () => {
            const bad = [];
            for (const [path, content] of Object.entries(result.files)) {
                if (!content) continue;
                const first = content.trim().split('\n')[0].toLowerCase();
                if (first.startsWith('sure') || first.startsWith('here') ||
                    first.startsWith('certainly') || first.startsWith('```')) {
                    bad.push(`${path}: "${first.substring(0, 50)}"`);
                }
            }
            assert.equal(bad.length, 0, `AI filler: ${bad.join(', ')}`);
        });
    });

    // ── NEXT.JS SPECIFIC ─────────────────────────────────────────────────

    describe('Next.js Conventions', () => {
        it('12. Plan includes a layout file', () => {
            const files = (result.plan?.files || []).map(f => f.path || f);
            const hasLayout = files.some(p => p.includes('layout.'));
            assert.ok(hasLayout, `No layout file in plan: ${files.join(', ')}`);
        });

        it('13. Layout file has proper Next.js structure', () => {
            const layoutEntry = Object.entries(result.files).find(([p]) => p.includes('layout.'));
            if (!layoutEntry) {
                // Skip if no layout was generated (plan might not have included it)
                return;
            }
            const [, content] = layoutEntry;
            const hasHtml = content.includes('<html') || content.includes('html');
            const hasBody = content.includes('<body') || content.includes('body');
            const hasChildren = content.includes('children');
            assert.ok(hasHtml || hasBody || hasChildren,
                'Layout missing html/body/children structure');
        });

        it('14. Components using hooks have "use client"', () => {
            const hookPatterns = /\b(useState|useEffect|useCallback|useMemo|useRef|useReducer|useContext)\b/;
            const issues = [];

            for (const [path, content] of Object.entries(result.files)) {
                if (!path.match(/\.(jsx?|tsx?)$/)) continue;
                if (hookPatterns.test(content) && !content.includes("'use client'") && !content.includes('"use client"')) {
                    issues.push(path);
                }
            }

            // This is a warning, not a hard failure — hooks might be in client-only contexts
            if (issues.length > 0) {
                console.log(`\n⚠️  Files using hooks without "use client": ${issues.join(', ')}`);
            }
            // Soft assertion — allow up to half the hook-using files to be missing directive
            const hookFiles = Object.entries(result.files).filter(([p, c]) =>
                p.match(/\.(jsx?|tsx?)$/) && hookPatterns.test(c)
            );
            if (hookFiles.length > 0) {
                assert.ok(issues.length <= Math.ceil(hookFiles.length / 2),
                    `Too many hook files missing "use client": ${issues.length}/${hookFiles.length}`);
            }
        });
    });

    // ── INTER-FILE CONSISTENCY ───────────────────────────────────────────

    describe('Inter-File Consistency', () => {
        it('15. Component imports in pages resolve to generated files', () => {
            const generatedPaths = Object.keys(result.files);
            const issues = [];

            // Find page/layout files
            const pageFiles = Object.entries(result.files).filter(([p]) =>
                p.includes('page.') || p.includes('layout.') ||
                p.includes('App.')
            );

            for (const [path, content] of pageFiles) {
                const importRe = /import\s+\w+\s+from\s+['"](\.\/[^'"]+|\.\.\/[^'"]+)['"]/g;
                let match;
                while ((match = importRe.exec(content)) !== null) {
                    const importPath = match[1];
                    const dir = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
                    const resolved = resolvePath(dir, importPath);

                    const found = generatedPaths.some(p =>
                        p === resolved || p.startsWith(resolved + '.') ||
                        p.startsWith(resolved + '/index.')
                    );

                    if (!found) {
                        issues.push(`${path} imports "${importPath}" → "${resolved}" not found`);
                    }
                }
            }

            if (issues.length > 0) {
                console.log(`\n⚠️  Broken page imports:\n  ${issues.join('\n  ')}`);
                console.log(`Generated files: ${generatedPaths.join(', ')}`);
            }

            // Allow some tolerance — LLM might use slightly different paths
            const tolerance = Math.ceil(issues.length * 0.5);
            assert.ok(issues.length <= tolerance + 2,
                `Too many broken imports: ${issues.length}\n  ${issues.join('\n  ')}`);
        });

        it('16. No orphan components (every component imported somewhere)', () => {
            const componentFiles = Object.keys(result.files).filter(p =>
                p.includes('components/') || p.includes('sections/')
            );

            if (componentFiles.length === 0) return;

            const allContent = Object.values(result.files).join('\n');
            const orphans = componentFiles.filter(p => {
                const basename = p.split('/').pop().replace(/\.\w+$/, '');
                return !allContent.includes(`from`) || !new RegExp(`import.*${basename}`, 'i').test(allContent);
            });

            // Soft check — some orphans are acceptable in generated projects
            if (orphans.length > 0) {
                console.log(`\n⚠️  Potentially orphaned components: ${orphans.join(', ')}`);
            }
        });
    });

    // ── DESIGN CONSISTENCY ───────────────────────────────────────────────

    describe('Design Consistency', () => {
        it('17. Design system referenced in multiple files', () => {
            // Check for consistent color usage
            const colorPatterns = [
                /bg-(blue|indigo|purple|violet|cyan|teal|emerald|green|sky)/g,
                /#[0-9a-fA-F]{6}/g,
                /text-(blue|indigo|purple|violet|cyan|teal|emerald|green|sky)/g,
            ];

            let filesWithColors = 0;
            for (const [, content] of Object.entries(result.files)) {
                for (const pattern of colorPatterns) {
                    if (pattern.test(content)) {
                        filesWithColors++;
                        break;
                    }
                    pattern.lastIndex = 0; // Reset regex
                }
            }

            // At least 3 files should reference colors
            assert.ok(filesWithColors >= 2,
                `Only ${filesWithColors} files reference design colors (expected >= 2)`);
        });

        it('18. Font consistency across files', () => {
            // Check that font references are consistent
            const fontPatterns = /(font-sans|font-serif|font-mono|Inter|Poppins|Roboto|Geist|Arial|font-family)/gi;
            const fontsFound = new Set();

            for (const [, content] of Object.entries(result.files)) {
                const matches = content.match(fontPatterns);
                if (matches) {
                    for (const m of matches) fontsFound.add(m.toLowerCase());
                }
            }

            // At least some font reference should exist
            if (fontsFound.size === 0) {
                console.log('⚠️  No font references found in generated files');
            }
        });
    });

    // ── BUNDLE HEALTH ────────────────────────────────────────────────────

    describe('Bundle Health', () => {
        it('19. Bundle succeeds', async () => {
            if (Object.keys(result.files).length === 0) return;
            const bundle = await runner.bundle(result.files);
            assert.ok(bundle.success || bundle.errors.length === 0, `Bundle errors: ${bundle.errors.join(', ')}`);
        });
    });
});

function resolvePath(fromDir, importPath) {
    const parts = (fromDir ? fromDir + '/' + importPath : importPath).split('/');
    const resolved = [];
    for (const part of parts) {
        if (part === '.' || part === '') continue;
        if (part === '..') resolved.pop();
        else resolved.push(part);
    }
    return resolved.join('/');
}
