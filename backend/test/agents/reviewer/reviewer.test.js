import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ReviewerAgent } from '../../../src/agents/reviewer/agent.js';
import { ProjectMemory } from '../../../src/agents/shared/memory.js';

// Minimal mock validator that considers everything valid unless it has "SYNTAX_ERROR" in content
const mockValidator = {
    validateFile(content, filePath, framework) {
        if (content.includes('SYNTAX_ERROR')) {
            return { isValid: false, errors: ['Syntax error detected'], warnings: [] };
        }
        return { isValid: true, errors: [], warnings: [] };
    },
    validateProjectStructure(files, framework) {
        return { isValid: true, warnings: [] };
    },
};

describe('ReviewerAgent', () => {
    let reviewer;
    let memory;

    beforeEach(() => {
        reviewer = new ReviewerAgent({ validator: mockValidator });
        memory = new ProjectMemory();
    });

    describe('structural review (Pass 1)', () => {
        it('detects planned but ungenerated files', async () => {
            memory.addPlannedFile('src/App.jsx', 'App');
            memory.addPlannedFile('src/components/Hero.jsx', 'Hero');
            memory.setFileGenerated('src/App.jsx', 'export default function App() {}', { isValid: true });
            // Hero stays planned (not generated)

            const result = await reviewer.reviewProject({ memory, requirements: { framework: 'react' } });
            assert.ok(result.reviewResult.allIssues.some(i => i.file === 'src/components/Hero.jsx'));
        });

        it('detects failed files', async () => {
            memory.setFileFailed('src/App.jsx', 'LLM timeout');

            const result = await reviewer.reviewProject({ memory, requirements: { framework: 'react' } });
            assert.ok(result.reviewResult.allIssues.some(i => i.file === 'src/App.jsx'));
        });
    });

    describe('import review (Pass 2)', () => {
        it('detects broken local imports', async () => {
            memory.addPlannedFile('src/App.jsx', 'App');
            memory.setFileGenerated('src/App.jsx',
                'import Hero from "./components/Hero";\nexport default function App() { return <Hero />; }',
                { isValid: true });
            // Hero.jsx does NOT exist

            const result = await reviewer.reviewProject({ memory, requirements: { framework: 'react' } });
            const importIssues = result.reviewResult.allIssues.filter(i => i.type === 'IMPORT_BROKEN');
            assert.ok(importIssues.length > 0, 'Should detect broken import to Hero');
        });

        it('does not flag external package imports', async () => {
            memory.setFileGenerated('src/App.jsx',
                'import React from "react";\nimport { motion } from "framer-motion";\nexport default function App() {}',
                { isValid: true });

            const result = await reviewer.reviewProject({ memory, requirements: { framework: 'react' } });
            const importIssues = result.reviewResult.allIssues.filter(i => i.type === 'IMPORT_BROKEN');
            assert.strictEqual(importIssues.length, 0, 'Should not flag react or framer-motion');
        });

        it('does not flag valid local imports', async () => {
            memory.addPlannedFile('src/components/Hero.jsx', 'Hero');
            memory.setFileGenerated('src/components/Hero.jsx',
                'export default function Hero() {}', { isValid: true });
            memory.setFileGenerated('src/App.jsx',
                'import Hero from "./components/Hero";\nexport default function App() { return <Hero />; }',
                { isValid: true });

            const result = await reviewer.reviewProject({ memory, requirements: { framework: 'react' } });
            const importIssues = result.reviewResult.allIssues.filter(i => i.type === 'IMPORT_BROKEN');
            assert.strictEqual(importIssues.length, 0, 'Valid imports should not be flagged');
        });
    });

    describe('issue classification', () => {
        it('classifies issues into critical, errors, and warnings', async () => {
            memory.addPlannedFile('src/App.jsx', 'App');
            memory.addPlannedFile('src/components/Missing.jsx', 'Missing');
            memory.setFileGenerated('src/App.jsx',
                'import Missing from "./components/Missing";\nexport default function App() {}',
                { isValid: true });
            // Missing.jsx stays planned

            const result = await reviewer.reviewProject({ memory, requirements: { framework: 'react' } });
            const { allIssues } = result.reviewResult;
            assert.ok(allIssues.length > 0);
        });
    });

    describe('clean project', () => {
        it('reports zero issues for valid project', async () => {
            memory.setFileGenerated('src/App.jsx',
                'import React from "react";\nexport default function App() { return <div>Hello</div>; }',
                { isValid: true });

            const result = await reviewer.reviewProject({ memory, requirements: { framework: 'react' } });
            // Might have zero issues (just external imports which are ignored)
            const errors = result.reviewResult.errors || [];
            const critical = result.reviewResult.critical || [];
            assert.strictEqual(critical.length, 0);
            assert.strictEqual(errors.length, 0);
        });
    });
});
