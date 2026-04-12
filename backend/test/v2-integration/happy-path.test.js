import { describe, it } from 'node:test';
import assert from 'node:assert';
import { runMockPipeline, MOCK_PLAN } from './harness.js';

describe('V2 Happy Path Integration', () => {
    it('generates all planned files without errors', async () => {
        const result = await runMockPipeline();

        assert.strictEqual(result.success, true, 'Pipeline should succeed');
        assert.strictEqual(result.metrics.filesFailed, 0, 'No files should fail');
        assert.strictEqual(result.metrics.filesGenerated, MOCK_PLAN.files.length,
            `Should generate ${MOCK_PLAN.files.length} files, got ${result.metrics.filesGenerated}`);
    });

    it('emits SSE events in correct order', async () => {
        const result = await runMockPipeline();
        const types = result.events.map(e => e.type);

        // Must start with generation_plan
        const planIdx = types.indexOf('generation_plan');
        assert.ok(planIdx >= 0, 'Should emit generation_plan');

        // Must have status events
        assert.ok(types.includes('status'), 'Should emit status events');

        // Must have file_generated events
        const genEvents = result.events.filter(e => e.type === 'file_generated');
        assert.strictEqual(genEvents.length, MOCK_PLAN.files.length,
            `Should have ${MOCK_PLAN.files.length} file_generated events`);

        // file_generated must come after generation_plan
        const firstGenIdx = types.indexOf('file_generated');
        assert.ok(firstGenIdx > planIdx, 'file_generated should come after generation_plan');
    });

    it('populates ProjectMemory with all files', async () => {
        const result = await runMockPipeline();

        for (const file of MOCK_PLAN.files) {
            const record = result.memory.getFile(file.path);
            assert.ok(record, `File ${file.path} should exist in memory`);
            assert.ok(record.content, `File ${file.path} should have content`);
            assert.ok(['generated', 'fixed'].includes(record.status),
                `File ${file.path} should be generated or fixed, got ${record.status}`);
        }
    });

    it('extracts contracts for JSX files', async () => {
        const result = await runMockPipeline();

        const app = result.memory.getFile('src/App.jsx');
        assert.ok(app.contracts, 'App.jsx should have contracts');
        assert.strictEqual(app.contracts.defaultExport, 'App', 'App.jsx default export should be App');

        const hero = result.memory.getFile('src/components/Hero.jsx');
        assert.ok(hero.contracts, 'Hero.jsx should have contracts');
        assert.strictEqual(hero.contracts.defaultExport, 'Hero');
        assert.ok(hero.contracts.props?.includes('title'), 'Hero should have title prop');
    });

    it('builds dependency graph', async () => {
        const result = await runMockPipeline();

        const appDeps = result.memory.getDependencies('src/App.jsx');
        assert.ok(appDeps.includes('src/components/Hero.jsx'),
            'App should depend on Hero — got: ' + JSON.stringify(appDeps));

        const heroDependents = result.memory.getDependents('src/components/Hero.jsx');
        assert.ok(heroDependents.includes('src/App.jsx'),
            'Hero should be depended on by App — got: ' + JSON.stringify(heroDependents));
    });

    it('reports full quality when no fixes needed', async () => {
        const result = await runMockPipeline();
        assert.strictEqual(result.quality, 'full',
            `Quality should be "full", got "${result.quality}"`);
    });

    it('traverses correct phases', async () => {
        const result = await runMockPipeline();
        const { phases } = result.metrics;

        assert.ok(phases.includes('planning'), 'Should have planning phase');
        assert.ok(phases.includes('plan_validation'), 'Should have plan_validation phase');
        assert.ok(phases.includes('generating'), 'Should have generating phase');
        assert.ok(phases.includes('reviewing'), 'Should have reviewing phase');
        assert.ok(phases.includes('done'), 'Should have done phase');
    });

    it('stores design system in memory', async () => {
        const result = await runMockPipeline();
        assert.ok(result.memory.designSystem, 'Design system should be stored');
        assert.strictEqual(result.memory.designSystem.primaryColor, '#3B82F6');
    });
});

describe('V2 Error Recovery Integration', () => {
    it('recovers from a single file failure via fix', async () => {
        const result = await runMockPipeline({
            failFiles: ['src/components/Hero.jsx'],
        });

        assert.strictEqual(result.success, true, 'Pipeline should still succeed');

        const hero = result.memory.getFile('src/components/Hero.jsx');
        assert.strictEqual(hero.status, 'fixed', 'Hero should be fixed after retry');

        assert.ok(result.metrics.filesFixed > 0, 'Should have at least one fixed file');

        // Check SSE events
        const fixingEvents = result.events.filter(e => e.type === 'file_fixing');
        const fixedEvents = result.events.filter(e => e.type === 'file_fixed');
        assert.ok(fixingEvents.length > 0, 'Should emit file_fixing');
        assert.ok(fixedEvents.length > 0, 'Should emit file_fixed');
    });

    it('reports repaired quality when files were fixed', async () => {
        const result = await runMockPipeline({
            failFiles: ['src/components/Hero.jsx'],
        });

        assert.strictEqual(result.quality, 'repaired',
            `Quality should be "repaired", got "${result.quality}"`);
    });

    it('handles plan validation correctly', async () => {
        const result = await runMockPipeline({ invalidPlan: true });

        // With invalid plan (missing entry), plan validation should catch it
        // but pipeline proceeds and generates what it can
        assert.ok(result.metrics.phases.includes('plan_validation'));
    });
});
