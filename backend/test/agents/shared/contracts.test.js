import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractContracts, formatContractCompact } from '../../../src/agents/shared/contracts.js';

describe('extractContracts', () => {
    describe('React/JS components', () => {
        it('extracts default export function', () => {
            const code = `import React from 'react';\nexport default function Hero({ title, subtitle }) {\n  return <div>{title}</div>;\n}`;
            const c = extractContracts(code, 'Hero.jsx');
            assert.strictEqual(c.defaultExport, 'Hero');
        });

        it('extracts destructured props', () => {
            const code = `export default function Hero({ title, subtitle, onAction }) {\n  return <div />;\n}`;
            const c = extractContracts(code, 'Hero.jsx');
            assert.ok(c.props, 'props should be extracted');
            assert.ok(c.props.includes('title'));
            assert.ok(c.props.includes('subtitle'));
            assert.ok(c.props.includes('onAction'));
        });

        it('extracts imports', () => {
            const code = `import React from 'react';\nimport { Button } from './Button';\nimport Hero from './Hero';\nexport default function App() {}`;
            const c = extractContracts(code, 'App.jsx');
            assert.ok(c.imports.includes('react'));
            assert.ok(c.imports.includes('./Button'));
            assert.ok(c.imports.includes('./Hero'));
        });

        it('extracts named exports', () => {
            const code = `export const API_URL = 'http://example.com';\nexport function fetchData() {}\nexport default function App() {}`;
            const c = extractContracts(code, 'App.jsx');
            assert.ok(c.exports.includes('API_URL'));
            assert.ok(c.exports.includes('fetchData'));
            assert.strictEqual(c.defaultExport, 'App');
        });

        it('extracts hooks used', () => {
            const code = `import { useState, useEffect } from 'react';\nfunction App() { const [s, setS] = useState(0); useEffect(() => {}, []); }`;
            const c = extractContracts(code, 'App.jsx');
            assert.ok(c.hooks.includes('useState'));
            assert.ok(c.hooks.includes('useEffect'));
        });

        it('handles re-exports from barrel files', () => {
            const code = `export { default as Hero } from './Hero';\nexport { default as Footer } from './Footer';\nexport { Button } from './Button';`;
            const c = extractContracts(code, 'index.js');
            assert.ok(c.exports.includes('Hero'));
            assert.ok(c.exports.includes('Footer'));
            assert.ok(c.exports.includes('Button'));
        });

        it('handles default export as variable name', () => {
            const code = `const Helper = () => <div />;\nexport default Helper;`;
            const c = extractContracts(code, 'Helper.jsx');
            assert.strictEqual(c.defaultExport, 'Helper');
        });

        it('extracts TypeScript interface props', () => {
            const code = `interface HeroProps {\n  title: string;\n  subtitle?: string;\n  count: number;\n}\nexport default function Hero(props: HeroProps) {}`;
            const c = extractContracts(code, 'Hero.tsx');
            assert.ok(c.props, 'TS interface props should be extracted');
            assert.ok(c.props.includes('title'));
            assert.ok(c.props.includes('subtitle'));
        });
    });

    describe('CSS files', () => {
        it('extracts custom properties', () => {
            const code = `:root { --primary: #3B82F6; --bg: #fff; }\n.hero { color: var(--primary); }`;
            const c = extractContracts(code, 'styles.css');
            assert.ok(c.exports.includes('--primary'));
            assert.ok(c.exports.includes('--bg'));
        });

        it('extracts @import rules', () => {
            const code = `@import './reset.css';\n@import 'normalize.css';\nbody { margin: 0; }`;
            const c = extractContracts(code, 'index.css');
            assert.ok(c.imports.includes('./reset.css'));
            assert.ok(c.imports.includes('normalize.css'));
        });
    });

    describe('package.json', () => {
        it('extracts dependencies as exports', () => {
            const code = JSON.stringify({ dependencies: { react: '^18', 'react-dom': '^18' }, devDependencies: { vite: '^5' } });
            const c = extractContracts(code, 'package.json');
            assert.ok(c.exports.includes('react'));
            assert.ok(c.exports.includes('react-dom'));
            assert.ok(c.exports.includes('vite'));
        });
    });

    describe('Vue SFC', () => {
        it('extracts defineProps', () => {
            const code = `<template><div>{{ msg }}</div></template>\n<script setup>\nimport { ref } from 'vue';\nconst props = defineProps({ msg: String, count: Number });\n</script>`;
            const c = extractContracts(code, 'MyComponent.vue');
            assert.ok(c.props);
            assert.ok(c.props.includes('msg'));
        });
    });

    describe('formatContractCompact', () => {
        it('formats a compact string', () => {
            const c = { defaultExport: 'Hero', exports: ['Hero', 'HERO_STYLES'], props: ['title', 'subtitle'] };
            const s = formatContractCompact(c);
            assert.ok(s.includes('Hero'));
            assert.ok(s.includes('title'));
        });

        it('handles null', () => {
            assert.strictEqual(formatContractCompact(null), 'no contract');
        });
    });

    describe('edge cases', () => {
        it('handles empty content', () => {
            const c = extractContracts('', 'empty.js');
            assert.deepStrictEqual(c.exports, []);
            assert.strictEqual(c.defaultExport, null);
        });

        it('handles null content', () => {
            const c = extractContracts(null, 'null.js');
            assert.deepStrictEqual(c.exports, []);
        });
    });
});
