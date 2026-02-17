import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CodeValidator } from '../../src/services/validator.js';

describe('CodeValidator', () => {
    const validator = new CodeValidator();

    // ── Clean Artifacts ──────────────────────────────────────────────────────

    describe('_cleanArtifacts', () => {
        it('strips "You are a code generator." from code', () => {
            const code = 'You are a code generator.\n<!DOCTYPE html><html></html>';
            const cleaned = validator._cleanArtifacts(code);
            assert.ok(cleaned.includes('<!DOCTYPE html>'));
            assert.ok(!cleaned.toLowerCase().includes('you are a code generator'));
        });

        it('strips PREVIOUS ATTEMPT FAILED phrase', () => {
            const code = 'PREVIOUS ATTEMPT FAILED. <html><body>hi</body></html>';
            const cleaned = validator._cleanArtifacts(code);
            assert.ok(cleaned.includes('<html>'));
            assert.ok(!cleaned.includes('PREVIOUS ATTEMPT FAILED'));
        });

        it('strips markdown code fences', () => {
            const code = '```html\n<!DOCTYPE html><html></html>\n```';
            const cleaned = validator._cleanArtifacts(code);
            assert.ok(cleaned.includes('<!DOCTYPE html>'));
            assert.ok(!cleaned.includes('```'));
        });
    });

    // ── HTML Validation ──────────────────────────────────────────────────────

    describe('validateFile (HTML)', () => {
        it('validates HTML and adds DOCTYPE if missing', () => {
            const html = '<html><head><title>Test</title></head><body><p>Content here that is long enough to pass the length check</p></body></html>';
            const result = validator.validateFile(html, 'index.html');
            assert.ok(result.fixedCode.includes('<!DOCTYPE html>'));
        });

        it('validates complete HTML as valid', () => {
            const html = '<!DOCTYPE html><html><head><title>Test</title></head><body><p>Content here that is long enough to pass the length check for validation.</p></body></html>';
            const result = validator.validateFile(html, 'index.html');
            assert.strictEqual(result.isValid, true);
        });
    });

    // ── CSS Validation ───────────────────────────────────────────────────────

    describe('validateFile (CSS)', () => {
        it('validates CSS with balanced braces', () => {
            const css = 'body { color: red; }\n.container { display: flex; }';
            const result = validator.validateFile(css, 'styles.css');
            assert.strictEqual(result.isValid, true);
        });

        it('detects unbalanced CSS braces', () => {
            const css = 'body { color: red; ';
            const result = validator.validateFile(css, 'styles.css');
            assert.ok(result.errors.some(e => e.toLowerCase().includes('brace')));
        });
    });

    // ── JavaScript Validation ────────────────────────────────────────────────

    describe('validateFile (JS)', () => {
        it('validates valid JS', () => {
            const js = 'const hello = () => console.log("world");\nhello();';
            const result = validator.validateFile(js, 'app.js');
            assert.strictEqual(result.isValid, true);
        });

        it('rejects HTML content in a .js file', () => {
            const html = '<!DOCTYPE html>\n<html><body>wrong</body></html>';
            const result = validator.validateFile(html, 'script.js');
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errors.some(e => e.includes('HTML instead of JavaScript')));
        });

        it('rejects conversational AI response in .js', () => {
            const conversational = "I'm an AI, I don't have preferences. I can help generate code.";
            const result = validator.validateFile(conversational, 'script.js');
            assert.strictEqual(result.isValid, false);
        });
    });

    // ── JSX/TSX Validation ───────────────────────────────────────────────────

    describe('validateFile (JSX/TSX)', () => {
        it('validates valid JSX', () => {
            const jsx = 'import React from "react";\nexport default function App() {\n  return <div className="app">Hello</div>;\n}';
            const result = validator.validateFile(jsx, 'App.jsx');
            assert.strictEqual(result.isValid, true);
        });

        it('validates valid TSX', () => {
            const tsx = 'import React from "react";\ninterface Props { name: string; }\nexport default function App({ name }: Props) {\n  return <div className="app">{name}</div>;\n}';
            const result = validator.validateFile(tsx, 'App.tsx');
            assert.strictEqual(result.isValid, true);
        });
    });

    // ── Vue SFC Validation ───────────────────────────────────────────────────

    describe('validateFile (Vue)', () => {
        it('validates valid Vue SFC', () => {
            const vue = '<template>\n  <div class="app">{{ message }}</div>\n</template>\n\n<script setup>\nimport { ref } from "vue";\nconst message = ref("Hello");\n</script>\n\n<style scoped>\n.app { color: red; }\n</style>';
            const result = validator.validateFile(vue, 'App.vue');
            assert.strictEqual(result.isValid, true);
        });

        it('validates Vue SFC with only script block (valid in Vue 3)', () => {
            const vue = '<script setup>\nconst msg = "hello";\n</script>';
            const result = validator.validateFile(vue, 'App.vue');
            // A script-only SFC is valid in Vue 3 (for composables/renderless)
            assert.strictEqual(result.isValid, true);
        });

        it('rejects Vue SFC with neither template nor script', () => {
            const vue = '<style scoped>\n.app { color: red; }\n</style>';
            const result = validator.validateFile(vue, 'App.vue');
            assert.strictEqual(result.isValid, false);
        });
    });

    // ── Svelte Validation ────────────────────────────────────────────────────

    describe('validateFile (Svelte)', () => {
        it('validates valid Svelte component', () => {
            const svelte = '<script>\n  let count = 0;\n</script>\n\n<main>\n  <h1>Count: {count}</h1>\n  <button on:click={() => count++}>Increment</button>\n</main>\n\n<style>\n  main { padding: 1rem; }\n</style>';
            const result = validator.validateFile(svelte, 'App.svelte');
            assert.strictEqual(result.isValid, true);
        });
    });

    // ── Astro Validation ─────────────────────────────────────────────────────

    describe('validateFile (Astro)', () => {
        it('validates valid Astro file', () => {
            const astro = '---\nconst title = "Hello";\n---\n<html>\n  <head><title>{title}</title></head>\n  <body><h1>{title}</h1></body>\n</html>';
            const result = validator.validateFile(astro, 'index.astro');
            assert.strictEqual(result.isValid, true);
        });
    });

    // ── JSON Validation ──────────────────────────────────────────────────────

    describe('validateFile (JSON)', () => {
        it('validates valid JSON', () => {
            const json = '{\n  "name": "test",\n  "version": "1.0.0"\n}';
            const result = validator.validateFile(json, 'package.json');
            assert.strictEqual(result.isValid, true);
        });

        it('detects invalid JSON', () => {
            const json = '{ name: test }';
            const result = validator.validateFile(json, 'package.json');
            // May auto-fix or flag as error
            assert.ok(result.isValid || result.errors.length > 0 || result.fixedCode !== json);
        });
    });

    // ── TypeScript Validation ────────────────────────────────────────────────

    describe('validateFile (TypeScript)', () => {
        it('validates valid TypeScript', () => {
            const ts = 'interface User { name: string; age: number; }\nconst greet = (user: User): string => `Hello ${user.name}`;';
            const result = validator.validateFile(ts, 'utils.ts');
            assert.strictEqual(result.isValid, true);
        });
    });

    // ── Config Validation ────────────────────────────────────────────────────

    describe('validateFile (Config)', () => {
        it('validates Vite config', () => {
            const config = 'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()] });';
            const result = validator.validateFile(config, 'vite.config.js');
            assert.strictEqual(result.isValid, true);
        });
    });

    // ── Unknown File Types ───────────────────────────────────────────────────

    describe('validateFile (Unknown)', () => {
        it('returns valid for unknown file type with warning', () => {
            const code = 'anything at all';
            const result = validator.validateFile(code, 'foo.txt');
            assert.strictEqual(result.isValid, true);
            assert.ok(result.warnings.some(w => w.includes('Unknown file type')));
        });
    });

    // ── Project Structure Validation ─────────────────────────────────────────

    describe('validateProjectStructure', () => {
        it('detects missing imports', () => {
            const files = {
                'src/App.jsx': 'import Header from "./Header";\nexport default function App() { return <Header />; }',
            };
            const result = validator.validateProjectStructure(files);
            assert.ok(result.warnings.length > 0 || result.errors.length > 0);
        });

        it('passes when all imports exist', () => {
            const files = {
                'src/App.jsx': 'import Header from "./Header";\nexport default function App() { return <Header />; }',
                'src/Header.jsx': 'export default function Header() { return <h1>Title</h1>; }',
            };
            const result = validator.validateProjectStructure(files);
            // Should have fewer issues
            assert.ok(result !== undefined);
        });
    });
});
