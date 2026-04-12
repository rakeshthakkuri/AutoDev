import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ContextBuilder, calculateTokenBudget } from '../../../src/agents/coder/context.js';
import { ProjectMemory } from '../../../src/agents/shared/memory.js';

describe('ContextBuilder', () => {
    let memory;
    let builder;

    beforeEach(() => {
        memory = new ProjectMemory();

        // Set up a simulated project
        memory.addPlannedFile('package.json', 'Dependencies');
        memory.addPlannedFile('src/index.css', 'Global styles');
        memory.addPlannedFile('src/App.jsx', 'Main component');
        memory.addPlannedFile('src/components/Hero.jsx', 'Hero section');
        memory.addPlannedFile('src/components/Footer.jsx', 'Footer section');

        // Generate some files
        memory.setFileGenerated('package.json',
            '{"dependencies":{"react":"^18"}}',
            { isValid: true });
        memory.setFileGenerated('src/index.css',
            '.container { max-width: 1200px; }\n.hero { padding: 2rem; }',
            { isValid: true });
        memory.setFileGenerated('src/App.jsx',
            'import React from "react";\nimport Hero from "./components/Hero";\nimport Footer from "./components/Footer";\nexport default function App() { return <div><Hero title="Hi" /><Footer /></div>; }',
            { isValid: true });
        memory.setFileGenerated('src/components/Hero.jsx',
            'import React from "react";\nexport default function Hero({ title, subtitle }) { return <section><h1>{title}</h1></section>; }',
            { isValid: true });

        memory.setDesignSystem({ primaryColor: '#3B82F6', fontFamily: 'Inter' });

        builder = new ContextBuilder(memory);
    });

    describe('buildContext', () => {
        it('returns non-empty context for a file with dependencies', () => {
            const ctx = builder.buildContext('src/components/Footer.jsx');
            assert.ok(ctx.length > 0, 'Context should not be empty');
        });

        it('includes reverse dependencies (consumers) in context', () => {
            // App.jsx imports Footer, so App should appear as a consumer
            const ctx = builder.buildContext('src/components/Footer.jsx');
            assert.ok(ctx.includes('App'), 'Context should mention App as a consumer of Footer');
        });

        it('includes design system in context', () => {
            const ctx = builder.buildContext('src/components/Footer.jsx');
            assert.ok(ctx.includes('primaryColor') || ctx.includes('#3B82F6'), 'Context should include design system');
        });

        it('includes sibling files in context', () => {
            const ctx = builder.buildContext('src/components/Footer.jsx');
            assert.ok(ctx.includes('Hero'), 'Context should mention sibling Hero.jsx');
        });

        it('respects token budget', () => {
            // Very small budget should still produce some context
            const ctx = builder.buildContext('src/components/Footer.jsx', 200);
            assert.ok(ctx.length < 1500, 'Context with tiny budget should be truncated');
        });

        it('returns empty string when no context available', () => {
            const emptyMemory = new ProjectMemory();
            const emptyBuilder = new ContextBuilder(emptyMemory);
            const ctx = emptyBuilder.buildContext('src/App.jsx');
            assert.strictEqual(ctx, '');
        });

        it('includes direct dependencies with full contracts', () => {
            // Generate Footer, then build context for App which depends on both Hero and Footer
            memory.setFileGenerated('src/components/Footer.jsx',
                'export default function Footer() { return <footer>Footer</footer>; }',
                { isValid: true });
            const ctx = builder.buildContext('src/App.jsx');
            // App depends on Hero and Footer — their contracts should appear
            assert.ok(ctx.includes('Hero') || ctx.includes('Footer'), 'Should include dependency contracts');
        });
    });
});

describe('calculateTokenBudget', () => {
    it('gives small budget for config files', () => {
        const budget = calculateTokenBudget('package.json', 'simple', null);
        assert.ok(budget <= 2048);
    });

    it('gives medium budget for components', () => {
        const budget = calculateTokenBudget('src/components/Hero.jsx', 'simple', null);
        assert.ok(budget >= 3000);
    });

    it('gives larger budget for advanced pages', () => {
        const simple = calculateTokenBudget('src/App.jsx', 'simple', null);
        const advanced = calculateTokenBudget('src/App.jsx', 'advanced', null);
        assert.ok(advanced > simple, 'Advanced should have larger budget');
    });

    it('scales up for files with many dependents', () => {
        const memory = new ProjectMemory();
        memory.addPlannedFile('src/utils/api.js', 'API utils');
        // Simulate 5 files depending on api.js
        for (let i = 0; i < 5; i++) {
            const path = `src/components/C${i}.jsx`;
            memory.addPlannedFile(path, '');
            memory.setFileGenerated(path,
                `import { fetchData } from "../utils/api";\nexport default function C${i}() {}`,
                { isValid: true });
        }
        memory.setFileGenerated('src/utils/api.js',
            'export function fetchData() {}', { isValid: true });

        const budget = calculateTokenBudget('src/utils/api.js', 'simple', memory);
        const baseBudget = calculateTokenBudget('src/utils/api.js', 'simple', null);
        assert.ok(budget >= baseBudget, 'Budget should scale up for high-dependent files');
    });
});
