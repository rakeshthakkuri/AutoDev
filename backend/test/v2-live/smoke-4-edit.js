// ═══════════════════════════════════════════════════════════════════════════════
// Smoke Test 4 — Edit Pipeline with Real LLM
// ═══════════════════════════════════════════════════════════════════════════════
//
// Step 1: Generate a simple React app
// Step 2: Run 3 edit operations (direct, prompt refinement, feature addition)
// Step 3: Bundle after each edit to verify correctness
//
// Run: node --test backend/test/v2-live/smoke-4-edit.js
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { LiveTestRunner } from './smoke-runner.js';

const PROMPT = 'Build a simple landing page with a hero section, feature cards, and a footer';
const FRAMEWORK = 'react';
const STYLING = 'tailwind';

let runner;
let generateResult;
let currentFiles;

describe('Smoke Test 4: Edit Pipeline', { timeout: 600_000 }, () => {

    before(async () => {
        runner = new LiveTestRunner({ timeout: 240_000 });
        await runner.setup();

        // Step 1: Generate a base project
        console.log('\n🚀 Step 1: Generating base project...');
        generateResult = await runner.generate(PROMPT, {
            framework: FRAMEWORK,
            styling: STYLING,
            complexity: 'simple',
        });

        runner.printSummary(generateResult);

        currentFiles = { ...generateResult.files };
        console.log(`\n📁 Base project: ${Object.keys(currentFiles).length} files`);
    });

    after(async () => {
        await runner.teardown();
    });

    // ── EDIT 1: Direct Non-Breaking Edit ─────────────────────────────────

    describe('Edit 1: Direct Edit', () => {
        let editResult;

        it('Runs direct edit on a component', async () => {
            // Find a Hero or main component to edit
            const targetFile = findComponent(currentFiles, ['Hero', 'hero', 'Header', 'header', 'App']);
            if (!targetFile) {
                console.log('⚠️  No suitable component found for direct edit, skipping');
                return;
            }

            const [filePath, originalContent] = targetFile;
            console.log(`\n  ✏️  Direct edit on: ${filePath}`);

            // Modify a heading in the content
            const modifiedContent = originalContent.replace(
                /(['"])([^'"]{5,40})\1/,  // Find a string literal
                '$1Updated Title Text$1'
            );

            editResult = await runner.edit(currentFiles, {
                editType: 'direct',
                payload: {
                    filePath,
                    newContent: modifiedContent,
                },
                framework: FRAMEWORK,
            });

            console.log(`  Duration: ${(editResult.duration / 1000).toFixed(1)}s`);
            console.log(`  Events: ${editResult.events.length}`);

            // Update current files
            currentFiles = editResult.updatedFiles;
        });

        it('Direct edit completes without error', () => {
            if (!editResult) return;
            const errors = editResult.events.filter(e =>
                e.type === 'edit_error' || e.type === 'generation_error'
            );
            assert.equal(errors.length, 0, `Edit errors: ${JSON.stringify(errors.map(e => e.data))}`);
        });

        it('Bundle works after direct edit', async () => {
            if (Object.keys(currentFiles).length === 0) return;
            const bundle = await runner.bundle(currentFiles);
            assert.ok(bundle.success || bundle.errors.length === 0,
                `Bundle failed after direct edit: ${bundle.errors.join(', ')}`);
        });
    });

    // ── EDIT 2: Prompt Refinement ────────────────────────────────────────

    describe('Edit 2: Prompt Refinement', () => {
        let editResult;

        it('Runs prompt refinement', async () => {
            console.log('\n  ✏️  Prompt refinement: dark gradient hero...');

            editResult = await runner.edit(currentFiles, {
                editType: 'prompt',
                payload: {
                    refinementPrompt: 'Make the hero section full-width with a dark gradient background and white text. Add a subtle animation on the heading.',
                },
                framework: FRAMEWORK,
                timeout: 120_000,
            });

            console.log(`  Duration: ${(editResult.duration / 1000).toFixed(1)}s`);
            console.log(`  Events: ${editResult.events.length}`);

            // Show which files were updated
            const updatedPaths = editResult.events
                .filter(e => e.type === 'edit_file_updated')
                .map(e => e.data?.path)
                .filter(Boolean);
            console.log(`  Updated files: ${updatedPaths.length > 0 ? updatedPaths.join(', ') : 'none reported in events'}`);

            currentFiles = editResult.updatedFiles;
        });

        it('Refinement completes without error', () => {
            if (!editResult) return;
            const errors = editResult.events.filter(e => e.type === 'edit_error');
            assert.equal(errors.length, 0, `Edit errors: ${JSON.stringify(errors.map(e => e.data))}`);
        });

        it('At least one file was updated', () => {
            if (!editResult) return;
            const updates = editResult.events.filter(e =>
                e.type === 'edit_file_updated' || e.type === 'edit_complete'
            );
            assert.ok(updates.length > 0, 'No update events from prompt refinement');
        });

        it('Bundle works after refinement', async () => {
            if (Object.keys(currentFiles).length === 0) return;
            const bundle = await runner.bundle(currentFiles);
            assert.ok(bundle.success || bundle.errors.length === 0,
                `Bundle failed after refinement: ${bundle.errors.join(', ')}`);
        });
    });

    // ── EDIT 3: Feature Addition ─────────────────────────────────────────

    describe('Edit 3: Feature Addition', () => {
        let editResult;
        let fileCountBefore;

        it('Runs feature addition', async () => {
            fileCountBefore = Object.keys(currentFiles).length;
            console.log(`\n  ✏️  Feature addition: contact form (${fileCountBefore} files before)...`);

            editResult = await runner.edit(currentFiles, {
                editType: 'feature',
                payload: {
                    featurePrompt: 'Add a contact form section with name, email, and message fields',
                },
                framework: FRAMEWORK,
                timeout: 120_000,
            });

            console.log(`  Duration: ${(editResult.duration / 1000).toFixed(1)}s`);
            console.log(`  Events: ${editResult.events.length}`);

            currentFiles = editResult.updatedFiles;
            const fileCountAfter = Object.keys(currentFiles).length;
            console.log(`  Files: ${fileCountBefore} → ${fileCountAfter} (${fileCountAfter - fileCountBefore > 0 ? '+' : ''}${fileCountAfter - fileCountBefore})`);
        });

        it('Feature addition completes without error', () => {
            if (!editResult) return;
            const errors = editResult.events.filter(e => e.type === 'edit_error');
            assert.equal(errors.length, 0, `Edit errors: ${JSON.stringify(errors.map(e => e.data))}`);
        });

        it('Bundle works after feature addition', async () => {
            if (Object.keys(currentFiles).length === 0) return;
            const bundle = await runner.bundle(currentFiles);
            assert.ok(bundle.success || bundle.errors.length === 0,
                `Bundle failed after feature addition: ${bundle.errors.join(', ')}`);
        });
    });

    // ── FULL TIMELINE ────────────────────────────────────────────────────

    it('Print full edit timeline', () => {
        console.log('\n' + '═'.repeat(70));
        console.log('EDIT PIPELINE TIMELINE');
        console.log('═'.repeat(70));
        console.log(`  Base generation: ${(generateResult.duration / 1000).toFixed(1)}s, ${Object.keys(generateResult.files).length} files`);
        console.log(`  Final file count: ${Object.keys(currentFiles).length}`);
        console.log(`  Final files:`);
        for (const path of Object.keys(currentFiles).sort()) {
            console.log(`    📄 ${path} (${currentFiles[path].length} chars)`);
        }
        console.log('═'.repeat(70));
    });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function findComponent(files, nameHints) {
    for (const hint of nameHints) {
        for (const [path, content] of Object.entries(files)) {
            if (path.toLowerCase().includes(hint.toLowerCase()) && path.match(/\.(jsx?|tsx?)$/)) {
                return [path, content];
            }
        }
    }
    // Fallback: return first JSX file that isn't main/index
    for (const [path, content] of Object.entries(files)) {
        if (path.match(/\.(jsx?|tsx?)$/) && !path.includes('main.') && !path.includes('index.')) {
            return [path, content];
        }
    }
    return null;
}
