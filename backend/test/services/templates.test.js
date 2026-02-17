import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getTemplate, vanillaHtml, vanillaCss, vanillaJs, packageJsonTemplates, configTemplates } from '../../src/services/templates.js';

describe('Templates', () => {
    // ── Raw Template Exports ─────────────────────────────────────────────────

    describe('vanillaHtml', () => {
        it('is a function that returns valid HTML', () => {
            assert.strictEqual(typeof vanillaHtml, 'function');
            const html = vanillaHtml('Test', 'Description');
            assert.ok(html.includes('<!DOCTYPE html>'));
            assert.ok(html.includes('Test'));
        });
    });

    describe('vanillaCss', () => {
        it('is a function that returns non-empty CSS', () => {
            assert.strictEqual(typeof vanillaCss, 'function');
            const css = vanillaCss();
            assert.ok(css.length > 50);
            assert.ok(css.includes('{'));
        });
    });

    describe('vanillaJs', () => {
        it('is a function that returns valid JS', () => {
            assert.strictEqual(typeof vanillaJs, 'function');
            const js = vanillaJs();
            assert.ok(js.includes('DOMContentLoaded') || js.includes('function') || js.includes('const'));
        });
    });

    describe('packageJsonTemplates', () => {
        it('has templates for major frameworks', () => {
            assert.ok(packageJsonTemplates.react);
            assert.ok(packageJsonTemplates.vue);
            assert.ok(packageJsonTemplates.nextjs);
            assert.ok(packageJsonTemplates.svelte);
            assert.ok(packageJsonTemplates.angular);
            assert.ok(packageJsonTemplates.astro);
        });
    });

    describe('configTemplates', () => {
        it('has vite and tailwind configs', () => {
            assert.ok(configTemplates['tsconfig.json']);
            assert.ok(configTemplates['tailwind.config.js']);
        });
    });

    // ── Vanilla JS ───────────────────────────────────────────────────────────

    describe('getTemplate (Vanilla JS)', () => {
        it('returns HTML for index.html', () => {
            const html = getTemplate('index.html', { title: 'Test', description: 'Desc' });
            assert.ok(html.includes('<!DOCTYPE html>'));
            assert.ok(html.includes('Test'));
        });

        it('returns CSS for styles.css', () => {
            const css = getTemplate('styles.css');
            assert.ok(css.includes('body') || css.includes('{'));
        });

        it('returns JS for script.js', () => {
            const js = getTemplate('script.js');
            assert.ok(js.includes('DOMContentLoaded') || js.includes('function') || js.includes('const'));
        });
    });

    // ── React Templates ──────────────────────────────────────────────────────

    describe('getTemplate (React)', () => {
        it('returns React JSX for App.jsx', () => {
            const jsx = getTemplate('src/App.jsx', { title: 'My App', framework: 'react' });
            assert.ok(jsx.includes('import') || jsx.includes('function') || jsx.includes('App'));
        });

        it('returns React index.html', () => {
            const html = getTemplate('index.html', { framework: 'react' });
            assert.ok(html.includes('<!DOCTYPE html>') || html.includes('<html'));
            assert.ok(html.includes('root'));
        });
    });

    // ── React-TS Templates ───────────────────────────────────────────────────

    describe('getTemplate (React-TS)', () => {
        it('returns TSX for App.tsx', () => {
            const tsx = getTemplate('src/App.tsx', { title: 'My App', framework: 'react-ts' });
            assert.ok(tsx.includes('App') || tsx.includes('function') || tsx.includes('export'));
        });
    });

    // ── Next.js Templates ────────────────────────────────────────────────────

    describe('getTemplate (Next.js)', () => {
        it('returns Next.js page for page.tsx', () => {
            const page = getTemplate('app/page.tsx', { framework: 'nextjs' });
            assert.ok(page.includes('export') || page.includes('function') || page.includes('Page'));
        });

        it('returns Next.js layout', () => {
            const layout = getTemplate('app/layout.tsx', { framework: 'nextjs' });
            assert.ok(layout.includes('html') || layout.includes('Layout') || layout.includes('children'));
        });
    });

    // ── Vue Templates ────────────────────────────────────────────────────────

    describe('getTemplate (Vue)', () => {
        it('returns Vue SFC for App.vue', () => {
            const vue = getTemplate('src/App.vue', { framework: 'vue' });
            assert.ok(vue.includes('<template>') || vue.includes('<script'));
        });
    });

    // ── Svelte Templates ─────────────────────────────────────────────────────

    describe('getTemplate (Svelte)', () => {
        it('returns Svelte component for App.svelte', () => {
            const svelte = getTemplate('src/App.svelte', { framework: 'svelte' });
            assert.ok(svelte.includes('<script') || svelte.includes('<main') || svelte.includes('<div'));
        });
    });

    // ── Angular Templates ────────────────────────────────────────────────────

    describe('getTemplate (Angular)', () => {
        it('returns Angular component for app.component.ts', () => {
            const ts = getTemplate('src/app/app.component.ts', { framework: 'angular' });
            assert.ok(ts.includes('Component') || ts.includes('@') || ts.includes('class') || ts.includes('export'));
        });
    });

    // ── Astro Templates ──────────────────────────────────────────────────────

    describe('getTemplate (Astro)', () => {
        it('returns Astro page for index.astro', () => {
            const astro = getTemplate('src/pages/index.astro', { framework: 'astro' });
            assert.ok(astro.includes('---') || astro.includes('<html') || astro.includes('<Layout'));
        });
    });

    // ── Config Templates ─────────────────────────────────────────────────────

    describe('getTemplate (Config)', () => {
        it('returns package.json for React', () => {
            const pkg = getTemplate('package.json', { framework: 'react' });
            assert.ok(pkg.includes('react') || pkg.includes('{'));
        });

        it('returns Vite config', () => {
            const config = getTemplate('vite.config.js', { framework: 'react' });
            assert.ok(config.includes('vite') || config.includes('export') || config.includes('define'));
        });

        it('returns tailwind config', () => {
            const tw = getTemplate('tailwind.config.js', { stylingFramework: 'tailwind' });
            assert.ok(tw.includes('content') || tw.includes('module.exports') || tw.includes('tailwind'));
        });
    });

    // ── Unknown ──────────────────────────────────────────────────────────────

    describe('getTemplate (Unknown)', () => {
        it('returns placeholder for unknown extension', () => {
            const out = getTemplate('foo.xyz');
            assert.ok(out.includes('Template for') || out.includes('foo.xyz') || out.length > 0);
        });
    });
});
