import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ProjectMemory } from '../../../src/agents/shared/memory.js';

describe('ProjectMemory', () => {
    let memory;

    beforeEach(() => {
        memory = new ProjectMemory();
    });

    describe('addPlannedFile', () => {
        it('adds a file with planned status', () => {
            memory.addPlannedFile('src/App.jsx', 'Main component');
            const file = memory.getFile('src/App.jsx');
            assert.ok(file);
            assert.strictEqual(file.status, 'planned');
            assert.strictEqual(file.purpose, 'Main component');
            assert.strictEqual(file.content, null);
        });
    });

    describe('setFileGenerated', () => {
        it('updates file with content and contracts', () => {
            memory.addPlannedFile('src/App.jsx', 'Main component');
            const code = 'import React from "react";\nimport Hero from "./components/Hero";\nexport default function App() { return <div><Hero /></div>; }';
            memory.setFileGenerated('src/App.jsx', code, { isValid: true });

            const file = memory.getFile('src/App.jsx');
            assert.strictEqual(file.status, 'generated');
            assert.strictEqual(file.content, code);
            assert.ok(file.contracts);
            assert.strictEqual(file.contracts.defaultExport, 'App');
            assert.ok(file.contracts.imports.includes('react'));
            assert.ok(file.contracts.imports.includes('./components/Hero'));
        });

        it('sets status to invalid when validation fails', () => {
            memory.setFileGenerated('src/Bad.jsx', 'bad code', { isValid: false, errors: ['syntax error'] });
            assert.strictEqual(memory.getFile('src/Bad.jsx').status, 'invalid');
        });
    });

    describe('setFileFixed', () => {
        it('updates status to fixed', () => {
            memory.setFileGenerated('src/App.jsx', 'bad', { isValid: false });
            memory.setFileFixed('src/App.jsx', 'export default function App() {}', { isValid: true });
            assert.strictEqual(memory.getFile('src/App.jsx').status, 'fixed');
        });
    });

    describe('setFileFailed', () => {
        it('marks file as failed', () => {
            memory.addPlannedFile('src/App.jsx', 'Main');
            memory.setFileFailed('src/App.jsx', 'LLM timeout');
            assert.strictEqual(memory.getFile('src/App.jsx').status, 'failed');
        });
    });

    describe('dependency graph', () => {
        it('builds forward dependencies from imports', () => {
            memory.addPlannedFile('src/components/Hero.jsx', 'Hero');
            memory.addPlannedFile('src/components/Footer.jsx', 'Footer');
            memory.addPlannedFile('src/App.jsx', 'App');

            memory.setFileGenerated('src/components/Hero.jsx',
                'import React from "react";\nexport default function Hero() { return <div />; }',
                { isValid: true });
            memory.setFileGenerated('src/components/Footer.jsx',
                'import React from "react";\nexport default function Footer() { return <div />; }',
                { isValid: true });
            memory.setFileGenerated('src/App.jsx',
                'import React from "react";\nimport Hero from "./components/Hero";\nimport Footer from "./components/Footer";\nexport default function App() { return <div><Hero /><Footer /></div>; }',
                { isValid: true });

            const deps = memory.getDependencies('src/App.jsx');
            assert.ok(deps.includes('src/components/Hero.jsx'), 'App should depend on Hero');
            assert.ok(deps.includes('src/components/Footer.jsx'), 'App should depend on Footer');
        });

        it('builds reverse dependencies (dependents)', () => {
            memory.addPlannedFile('src/components/Hero.jsx', 'Hero');
            memory.addPlannedFile('src/App.jsx', 'App');

            memory.setFileGenerated('src/components/Hero.jsx',
                'export default function Hero() {}', { isValid: true });
            memory.setFileGenerated('src/App.jsx',
                'import Hero from "./components/Hero";\nexport default function App() { return <Hero />; }',
                { isValid: true });

            const dependents = memory.getDependents('src/components/Hero.jsx');
            assert.ok(dependents.includes('src/App.jsx'), 'Hero should be depended on by App');
        });
    });

    describe('resolveImport', () => {
        it('resolves relative import with extension', () => {
            memory.addPlannedFile('src/components/Hero.jsx', 'Hero');
            const resolved = memory.resolveImport('src/App.jsx', './components/Hero');
            assert.strictEqual(resolved, 'src/components/Hero.jsx');
        });

        it('returns null for external packages', () => {
            assert.strictEqual(memory.resolveImport('src/App.jsx', 'react'), null);
        });

        it('returns null for unresolvable imports', () => {
            assert.strictEqual(memory.resolveImport('src/App.jsx', './Missing'), null);
        });
    });

    describe('getGeneratedFiles', () => {
        it('returns flat object of path → content', () => {
            memory.setFileGenerated('a.js', 'code-a', { isValid: true });
            memory.setFileGenerated('b.js', 'code-b', { isValid: true });
            const files = memory.getGeneratedFiles();
            assert.strictEqual(files['a.js'], 'code-a');
            assert.strictEqual(files['b.js'], 'code-b');
        });

        it('excludes files with no content', () => {
            memory.addPlannedFile('c.js', 'planned');
            const files = memory.getGeneratedFiles();
            assert.strictEqual(files['c.js'], undefined);
        });
    });

    describe('getStatusCounts', () => {
        it('counts files by status', () => {
            memory.addPlannedFile('a.js', '');
            memory.setFileGenerated('b.js', 'code', { isValid: true });
            memory.setFileFailed('c.js', 'err');
            const counts = memory.getStatusCounts();
            assert.strictEqual(counts.planned, 1);
            assert.strictEqual(counts.generated, 1);
            assert.strictEqual(counts.failed, 1);
        });
    });

    describe('errors and decisions', () => {
        it('stores errors with timestamp', () => {
            memory.addError({ type: 'SYNTAX_ERROR', file: 'a.js', message: 'bad' });
            assert.strictEqual(memory.errors.length, 1);
            assert.ok(memory.errors[0].timestamp);
        });

        it('stores decisions with timestamp', () => {
            memory.addDecision('planner', 'create_plan', 'Created 5 files');
            assert.strictEqual(memory.decisions.length, 1);
            assert.strictEqual(memory.decisions[0].agent, 'planner');
        });
    });
});
