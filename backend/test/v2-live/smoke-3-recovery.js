// ═══════════════════════════════════════════════════════════════════════════════
// Smoke Test 3 — Advanced Error Recovery (Real Gemini Calls — Diagnostic)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Intentionally ambitious prompt to stress-test the repair pipeline.
// Reports diagnostics rather than hard assertions.
//
// Run: node --test backend/test/v2-live/smoke-3-recovery.js
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import { LiveTestRunner } from './smoke-runner.js';

const PROMPT = 'Build an advanced project management dashboard with kanban board, task detail modals, user avatars, drag-and-drop functionality, search/filter, and dark mode toggle';
const FRAMEWORK = 'react-ts';
const STYLING = 'tailwind';
const COMPLEXITY = 'advanced';

let runner;
let result;

describe('Smoke Test 3: Advanced Error Recovery (Diagnostic)', { timeout: 480_000 }, () => {

    before(async () => {
        runner = new LiveTestRunner({ timeout: 360_000 });
        await runner.setup();

        console.log('\n🚀 Starting ADVANCED generation (expect some fixes)...');
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

    // ── DIAGNOSTIC REPORTS (no hard failures) ────────────────────────────

    it('Report: Generation Overview', () => {
        const report = [];
        report.push('\n' + '═'.repeat(70));
        report.push('DIAGNOSTIC REPORT: Error Recovery Analysis');
        report.push('═'.repeat(70));

        // 1. Files generated clean
        const clean = Object.entries(result.fileStatuses || {}).filter(([, s]) => s.status === 'generated');
        report.push(`\n1. Files generated clean (no fix needed): ${clean.length}`);
        for (const [p] of clean) report.push(`   ✅ ${p}`);

        // 2. Files that needed the Fixer
        const fixed = Object.entries(result.fileStatuses || {}).filter(([, s]) => s.status === 'fixed');
        report.push(`\n2. Files needing Fixer agent: ${fixed.length}`);
        for (const [p] of fixed) report.push(`   🔧 ${p}`);

        // 3. Files that fell back to templates
        const templateEvents = result.events.filter(e =>
            e.type === 'status' && e.data?.message?.includes('template')
        );
        report.push(`\n3. Template fallbacks: ${templateEvents.length}`);

        // 4. Files that failed entirely
        const failed = Object.entries(result.fileStatuses || {}).filter(([, s]) => s.status === 'failed');
        const errorEvents = result.events.filter(e => e.type === 'file_error');
        report.push(`\n4. Files failed entirely: ${failed.length + errorEvents.length}`);
        for (const [p] of failed) report.push(`   ❌ ${p}`);
        for (const e of errorEvents) report.push(`   ❌ ${e.data?.path || 'unknown'}: ${e.data?.error}`);

        // 5. Plan revisions
        const planEvents = result.events.filter(e =>
            e.type === 'status' && (e.data?.message?.includes('revis') || e.data?.message?.includes('plan'))
        );
        report.push(`\n5. Plan revision events: ${planEvents.length}`);

        // 6. Total LLM calls (approximation from events)
        const generatedCount = Object.keys(result.files).length;
        const fixAttempts = result.events.filter(e => e.type === 'file_fixing').length;
        const estimatedLLMCalls = 1 + 1 + generatedCount + fixAttempts; // analyze + plan + files + fixes
        report.push(`\n6. Estimated LLM calls: ${estimatedLLMCalls}`);

        // 7. Total duration
        report.push(`\n7. Total duration: ${(result.duration / 1000).toFixed(1)}s`);

        // 8. Quality level
        const completeEvent = result.events.find(e => e.type === 'generation_complete');
        const quality = completeEvent?.data?.metrics?.quality || result.metrics?.quality || 'unknown';
        report.push(`\n8. Final quality level: ${quality}`);

        report.push('\n' + '═'.repeat(70));
        console.log(report.join('\n'));
    });

    it('Report: Fix Attempt Details', () => {
        const fixingEvents = result.events.filter(e => e.type === 'file_fixing');
        const fixedEvents = result.events.filter(e => e.type === 'file_fixed');

        if (fixingEvents.length === 0) {
            console.log('\n✅ No files needed fixing!');
            return;
        }

        console.log(`\n${'─'.repeat(50)}`);
        console.log(`FIX ATTEMPT DETAILS (${fixingEvents.length} attempts)`);
        console.log('─'.repeat(50));

        for (const evt of fixingEvents) {
            const path = evt.data?.path || 'unknown';
            const attempt = evt.data?.attempt || '?';
            const errors = evt.data?.errors || [];

            console.log(`\n  🔧 ${path} (attempt ${attempt})`);
            console.log(`     Original errors: ${Array.isArray(errors) ? errors.join('; ') : errors}`);

            // Check if it was eventually fixed
            const wasFixed = fixedEvents.some(f => f.data?.path === path);
            console.log(`     Fix succeeded: ${wasFixed ? '✅' : '❌'}`);
        }
    });

    it('Report: Failed File Analysis', () => {
        const failed = Object.entries(result.fileStatuses || {}).filter(([, s]) => s.status === 'failed');
        const errorEvents = result.events.filter(e => e.type === 'file_error');

        if (failed.length === 0 && errorEvents.length === 0) {
            console.log('\n✅ No files failed!');
            return;
        }

        console.log(`\n${'─'.repeat(50)}`);
        console.log(`FAILED FILE ANALYSIS`);
        console.log('─'.repeat(50));

        for (const [path] of failed) {
            const content = result.files[path] || '';
            console.log(`\n  ❌ ${path}`);
            console.log(`     Content (first 30 lines):`);
            const lines = content.split('\n').slice(0, 30);
            for (const line of lines) console.log(`       ${line}`);

            // Extract validation info
            const status = result.fileStatuses[path];
            if (status?.validation?.errors) {
                console.log(`     Validation errors: ${JSON.stringify(status.validation.errors)}`);
            }
        }

        for (const evt of errorEvents) {
            console.log(`\n  ❌ Event error: ${JSON.stringify(evt.data)}`);
        }
    });

    it('Report: Pipeline Health Summary', () => {
        const total = Object.keys(result.files).length;
        const planned = (result.plan?.files || []).length;
        const clean = Object.entries(result.fileStatuses || {}).filter(([, s]) => s.status === 'generated').length;
        const fixed = Object.entries(result.fileStatuses || {}).filter(([, s]) => s.status === 'fixed').length;
        const failed = Object.entries(result.fileStatuses || {}).filter(([, s]) => s.status === 'failed').length;
        const hasCompletion = result.events.some(e => e.type === 'generation_complete');
        const hasError = result.events.some(e => e.type === 'generation_error');

        console.log(`\n${'─'.repeat(50)}`);
        console.log('PIPELINE HEALTH SUMMARY');
        console.log('─'.repeat(50));
        console.log(`  Planned files:  ${planned}`);
        console.log(`  Generated:      ${total}`);
        console.log(`  Clean:          ${clean} (${total > 0 ? Math.round(clean / total * 100) : 0}%)`);
        console.log(`  Fixed:          ${fixed} (${total > 0 ? Math.round(fixed / total * 100) : 0}%)`);
        console.log(`  Failed:         ${failed} (${total > 0 ? Math.round(failed / total * 100) : 0}%)`);
        console.log(`  Completion:     ${hasCompletion ? '✅' : '❌'}`);
        console.log(`  Errors:         ${hasError ? '❌ generation_error emitted' : '✅ none'}`);
        console.log(`  Duration:       ${(result.duration / 1000).toFixed(1)}s`);
        console.log('─'.repeat(50));
    });
});
