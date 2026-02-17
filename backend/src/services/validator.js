import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CodeValidator {
    constructor() {
        this.validationMetrics = {
            totalValidations: 0,
            passed: 0,
            failed: 0,
            autoFixed: 0
        };
    }

    // ─── Conversational / artifact detection ────────────────────────────

    _isConversationalResponse(code) {
        if (!code || typeof code !== 'string') return false;
        const firstLines = code.trim().split('\n').slice(0, 5).join('\n').toLowerCase();
        const patterns = [
            "i'm an ai", "i am an ai", "i don't have", "i can assist you",
            "i would need to know", "please provide", "to do this, i",
            "once i have this information", "i can help you",
            "i need more information", "could you please",
            "what is the project type", "what is the design style",
            "sure, here", "certainly!", "of course!"
        ];
        return patterns.some(p => firstLines.includes(p));
    }

    _cleanArtifacts(code) {
        let c = code;
        const artifacts = [
            "You are a helpful coding assistant.",
            "You are a code generator. Output ONLY code. Do not output conversational text.",
            "You are a code generator.", "You are a code assistant. Output ONLY code.",
            "You are a code assistant.", "You are an expert full-stack developer.",
            "Here is the code:", "Sure, here is the code:",
            "MANDATORY CODE QUALITY STANDARDS:", "SPECIFIC INSTRUCTIONS FOR",
            "Generate ONLY the code for", "NO explanations, NO markdown formatting",
            "```html", "```css", "```javascript", "```js", "```jsx",
            "```tsx", "```typescript", "```ts", "```vue", "```svelte",
            "```astro", "```json", "```scss", "```",
            "PREVIOUS ATTEMPT FAILED. Fix any errors and generate complete, valid code again.",
            "PREVIOUS ATTEMPT FAILED.", "Fix any errors and generate complete, valid code again.",
        ];
        artifacts.forEach(a => {
            if (a.startsWith('`')) { c = c.replaceAll(a, ''); }
            else { c = c.replace(new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ''); }
        });
        c = c.replace(/\s*\[Retry:[^\]]*\]\s*/gi, '').trim();
        return c.trim();
    }

    // ─── HTML Validation ────────────────────────────────────────────────

    validateHtml(code, filePath = '') {
        const errors = [], warnings = [];
        let fixedCode = code;

        if (!/<!DOCTYPE\s+html/i.test(code)) {
            errors.push('Missing DOCTYPE declaration');
            fixedCode = `<!DOCTYPE html>\n${fixedCode}`;
        }
        if (!/<html/i.test(code)) {
            errors.push('Missing <html> tag');
            fixedCode = fixedCode.includes('<!DOCTYPE') ?
                fixedCode.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<html lang="en">') :
                `<html lang="en">\n${fixedCode}`;
            if (!fixedCode.includes('</html>')) fixedCode += '\n</html>';
        }
        if (!/<head/i.test(code)) warnings.push('Missing <head> tag');
        if (!/<body/i.test(code)) warnings.push('Missing <body> tag');
        if (code.trim().length < 50) errors.push('HTML file is too short (likely incomplete)');

        return { isValid: errors.length === 0, errors, warnings, fixedCode: fixedCode !== code ? fixedCode : null };
    }

    // ─── CSS / SCSS Validation ──────────────────────────────────────────

    validateCss(code, filePath = '') {
        const errors = [], warnings = [];
        let fixedCode = code;

        const open = (code.match(/{/g) || []).length;
        const close = (code.match(/}/g) || []).length;
        if (open !== close) {
            errors.push(`Unmatched braces: ${open} opening, ${close} closing`);
            if (open > close) { fixedCode += '\n' + '}'.repeat(open - close); warnings.push(`Auto-added ${open - close} closing brace(s)`); }
        }
        if (code.trim().length === 0) warnings.push('CSS file is empty');

        return { isValid: errors.length === 0, errors, warnings, fixedCode: fixedCode !== code ? fixedCode : null };
    }

    // ─── JavaScript Validation ──────────────────────────────────────────

    validateJavascript(code, filePath = '') {
        const errors = [], warnings = [];

        const openB = (code.match(/{/g) || []).length;
        const closeB = (code.match(/}/g) || []).length;
        if (openB !== closeB) errors.push(`Unmatched braces: ${openB} opening, ${closeB} closing`);

        const openP = (code.match(/\(/g) || []).length;
        const closeP = (code.match(/\)/g) || []).length;
        if (openP !== closeP) errors.push(`Unmatched parentheses: ${openP} opening, ${closeP} closing`);

        // node --check for .js files (skip for modules with import/export since node may not understand JSX)
        if (!code.includes('import ') && !code.includes('export ')) {
            try {
                const tempFile = path.join(__dirname, `temp_${Date.now()}.js`);
                fs.writeFileSync(tempFile, code);
                try {
                    execSync(`node --check "${tempFile}"`, { stdio: 'pipe' });
                } catch (error) {
                    const msg = error.stderr?.toString() || error.message;
                    if (msg.includes('SyntaxError')) errors.push(`Syntax error: ${msg.split('\n')[0]}`);
                } finally {
                    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                }
            } catch (_) { /* skip */ }
        }

        if (code.trim().length === 0) warnings.push('JavaScript file is empty');

        return { isValid: errors.length === 0, errors, warnings, fixedCode: null };
    }

    // ─── JSX / TSX Validation ───────────────────────────────────────────

    validateJsx(code, filePath = '') {
        const errors = [], warnings = [];
        let fixedCode = code;

        // class → className
        if (code.includes('class=') && !code.includes('className') && !filePath.endsWith('.vue') && !filePath.endsWith('.svelte')) {
            warnings.push("'class' attribute found in JSX — should be 'className'");
            fixedCode = fixedCode.replace(/\bclass="/g, 'className="');
        }

        // Brace matching
        const openB = (code.match(/{/g) || []).length;
        const closeB = (code.match(/}/g) || []).length;
        if (Math.abs(openB - closeB) > 2) errors.push(`Severely unmatched braces: ${openB} opening, ${closeB} closing`);

        return { isValid: errors.length === 0, errors, warnings, fixedCode: fixedCode !== code ? fixedCode : null };
    }

    // ─── TypeScript Validation (.ts, .tsx) ──────────────────────────────

    validateTypeScript(code, filePath = '') {
        const errors = [], warnings = [];
        let fixedCode = code;

        // JSX checks for .tsx
        if (filePath.endsWith('.tsx')) {
            const jsxResult = this.validateJsx(code, filePath);
            errors.push(...jsxResult.errors);
            warnings.push(...jsxResult.warnings);
            if (jsxResult.fixedCode) fixedCode = jsxResult.fixedCode;
        }

        // Basic TS syntax checks
        const openB = (code.match(/{/g) || []).length;
        const closeB = (code.match(/}/g) || []).length;
        if (Math.abs(openB - closeB) > 2) errors.push(`Unmatched braces: ${openB} opening, ${closeB} closing`);

        // Check for common TS issues
        if (code.includes('any') && code.split('any').length > 10) {
            warnings.push('Excessive use of "any" type — consider using specific types');
        }

        return { isValid: errors.length === 0, errors, warnings, fixedCode: fixedCode !== code ? fixedCode : null };
    }

    // ─── Vue SFC Validation ─────────────────────────────────────────────

    validateVue(code, filePath = '') {
        const errors = [], warnings = [];

        const hasTemplate = /<template[\s>]/i.test(code);
        const hasScript = /<script/i.test(code);

        if (!hasTemplate && !hasScript) {
            errors.push('Vue SFC must have at least a <template> or <script> section');
        }
        if (hasTemplate && !/<\/template>/i.test(code)) {
            errors.push('Unclosed <template> tag');
        }
        if (hasScript && !/<\/script>/i.test(code)) {
            errors.push('Unclosed <script> tag');
        }
        if (/<style/i.test(code) && !/<\/style>/i.test(code)) {
            errors.push('Unclosed <style> tag');
        }

        // Check for Composition API usage
        if (hasScript && code.includes('setup')) {
            if (!code.includes('ref') && !code.includes('reactive') && !code.includes('computed')) {
                warnings.push('Script setup detected but no reactivity primitives used');
            }
        }

        return { isValid: errors.length === 0, errors, warnings, fixedCode: null };
    }

    // ─── Svelte Validation ──────────────────────────────────────────────

    validateSvelte(code, filePath = '') {
        const errors = [], warnings = [];

        // Svelte components must have some HTML content
        const hasHtml = /<[a-z][^>]*>/i.test(code);
        const hasScript = /<script/i.test(code);

        if (!hasHtml && !hasScript) {
            errors.push('Svelte component must have HTML content or a <script> block');
        }
        if (hasScript && !/<\/script>/i.test(code)) {
            errors.push('Unclosed <script> tag');
        }
        if (/<style/i.test(code) && !/<\/style>/i.test(code)) {
            errors.push('Unclosed <style> tag');
        }

        // Check for common Svelte patterns
        if (code.includes('{#each') && !code.includes('{/each}')) {
            errors.push('Unclosed {#each} block');
        }
        if (code.includes('{#if') && !code.includes('{/if}')) {
            errors.push('Unclosed {#if} block');
        }

        return { isValid: errors.length === 0, errors, warnings, fixedCode: null };
    }

    // ─── Astro Validation ───────────────────────────────────────────────

    validateAstro(code, filePath = '') {
        const errors = [], warnings = [];

        // Astro files typically have frontmatter (---) and HTML
        const hasFrontmatter = /^---\n[\s\S]*?\n---/m.test(code);
        const hasHtml = /<[a-z][^>]*>/i.test(code);

        if (!hasFrontmatter && !hasHtml) {
            warnings.push('Astro file has no frontmatter (---) and no HTML content');
        }

        // Check for unclosed frontmatter
        const dashes = code.match(/^---$/gm);
        if (dashes && dashes.length % 2 !== 0) {
            errors.push('Unclosed frontmatter block (---) in Astro file');
        }

        return { isValid: errors.length === 0, errors, warnings, fixedCode: null };
    }

    // ─── JSON Validation ────────────────────────────────────────────────

    validateJson(code, filePath = '') {
        const errors = [], warnings = [];
        let fixedCode = null;

        try {
            JSON.parse(code);
        } catch (e) {
            errors.push(`Invalid JSON: ${e.message}`);
            // Try to fix common issues
            try {
                const fixed = code
                    .replace(/,(\s*[}\]])/g, '$1')          // trailing commas
                    .replace(/(['"])?([a-zA-Z0-9_$]+)(['"])?\s*:/g, '"$2":')  // unquoted keys
                    .replace(/'/g, '"');                       // single quotes
                JSON.parse(fixed);
                fixedCode = fixed;
                warnings.push('Auto-fixed JSON syntax issues');
            } catch (_) {
                // Can't auto-fix
            }
        }

        return { isValid: errors.length === 0, errors, warnings, fixedCode };
    }

    // ─── Config File Validation ─────────────────────────────────────────

    validateConfig(code, filePath = '') {
        const errors = [], warnings = [];
        const fname = path.basename(filePath).toLowerCase();

        if (code.trim().length === 0) {
            errors.push('Config file is empty');
            return { isValid: false, errors, warnings, fixedCode: null };
        }

        // Check for common config patterns
        if (fname.includes('vite.config')) {
            if (!code.includes('defineConfig') && !code.includes('export default')) {
                warnings.push('Vite config should export a configuration using defineConfig()');
            }
        } else if (fname.includes('tailwind.config')) {
            if (!code.includes('content') && !code.includes('module.exports') && !code.includes('export default')) {
                warnings.push('Tailwind config should have a content array and export');
            }
        } else if (fname.includes('next.config')) {
            if (!code.includes('module.exports') && !code.includes('export default')) {
                warnings.push('Next.js config should export a configuration object');
            }
        }

        return { isValid: errors.length === 0, errors, warnings, fixedCode: null };
    }

    // ─── Auto-Fix Common Errors ─────────────────────────────────────────

    autoFixCommonErrors(code, fileType) {
        const fixes = [];
        let fixed = code;

        if (fileType === 'html') {
            if (!/<!DOCTYPE/i.test(fixed)) { fixed = `<!DOCTYPE html>\n${fixed}`; fixes.push('Added DOCTYPE'); }
            if (!/<html/i.test(fixed)) { fixed = `<html lang="en">\n${fixed}\n</html>`; fixes.push('Wrapped in html tags'); }
        }

        if (['css', 'scss', 'js', 'jsx', 'ts', 'tsx'].includes(fileType)) {
            const o = (fixed.match(/{/g) || []).length;
            const c = (fixed.match(/}/g) || []).length;
            if (o > c) { fixed += '\n' + '}'.repeat(o - c); fixes.push(`Added ${o - c} closing brace(s)`); }
        }

        return { fixedCode: fixed, fixesApplied: fixes };
    }

    // ─── Main Entry: Validate File ──────────────────────────────────────

    validateFile(code, filePath) {
        this.validationMetrics.totalValidations++;

        const cleanCode = this._cleanArtifacts(code);
        const ext = path.extname(filePath).toLowerCase();
        const fname = path.basename(filePath).toLowerCase();

        let result = { isValid: false, errors: [], warnings: [], fixedCode: null, fixesApplied: [], filePath };

        try {
            // Reject wrong content type
            if (['.js', '.jsx', '.ts', '.tsx'].includes(ext) &&
                (/^\s*<!DOCTYPE\s+html/i.test(cleanCode) || /^\s*<html[\s>]/i.test(cleanCode))) {
                result.errors.push('File contains HTML instead of JavaScript/TypeScript');
                result.fixedCode = cleanCode;
                this.validationMetrics.failed++;
                return result;
            }

            // Reject conversational responses
            if (['.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.vue', '.svelte'].includes(ext) &&
                this._isConversationalResponse(cleanCode)) {
                result.errors.push('File contains conversational AI response instead of code');
                result.fixedCode = cleanCode;
                this.validationMetrics.failed++;
                return result;
            }

            // Route to appropriate validator
            if (ext === '.html' || fname === 'index.html') {
                result = { ...result, ...this.validateHtml(cleanCode, filePath) };
            } else if (ext === '.css' || ext === '.scss') {
                result = { ...result, ...this.validateCss(cleanCode, filePath) };
            } else if (ext === '.js' && !fname.endsWith('.config.js')) {
                result = { ...result, ...this.validateJavascript(cleanCode, filePath) };
            } else if (ext === '.jsx') {
                result = { ...result, ...this.validateJsx(cleanCode, filePath) };
            } else if (ext === '.ts' || ext === '.tsx') {
                result = { ...result, ...this.validateTypeScript(cleanCode, filePath) };
            } else if (ext === '.vue') {
                result = { ...result, ...this.validateVue(cleanCode, filePath) };
            } else if (ext === '.svelte') {
                result = { ...result, ...this.validateSvelte(cleanCode, filePath) };
            } else if (ext === '.astro') {
                result = { ...result, ...this.validateAstro(cleanCode, filePath) };
            } else if (ext === '.json') {
                result = { ...result, ...this.validateJson(cleanCode, filePath) };
            } else if (fname.includes('config') || ext === '.mjs' || ext === '.cjs') {
                result = { ...result, ...this.validateConfig(cleanCode, filePath) };
            } else {
                result.warnings.push(`Unknown file type: ${ext}`);
                result.isValid = true;
            }

            // Auto-fix if failed
            if (!result.isValid && !result.fixedCode) {
                const autoFix = this.autoFixCommonErrors(cleanCode, ext.replace('.', ''));
                if (autoFix.fixesApplied.length > 0) {
                    result.fixedCode = autoFix.fixedCode;
                    result.fixesApplied = autoFix.fixesApplied;
                }
            }

            if (result.isValid) this.validationMetrics.passed++;
            else this.validationMetrics.failed++;

            if (result.fixesApplied.length > 0 || result.fixedCode) this.validationMetrics.autoFixed++;

            result.fixedCode = result.fixedCode ?? cleanCode;
        } catch (e) {
            result.errors.push(`Validation error: ${e.message}`);
            this.validationMetrics.failed++;
        }

        return result;
    }

    // ─── Project Structure Validation ───────────────────────────────────

    validateProjectStructure(files, framework) {
        const warnings = [];
        const filePaths = Object.keys(files);

        const checks = {
            'vanilla-js': () => {
                if (!filePaths.some(p => p.endsWith('.html'))) warnings.push('Missing HTML entry point');
            },
            'react': () => {
                if (!filePaths.some(p => p.includes('App.jsx') || p.includes('App.js'))) warnings.push('Missing App component');
                if (!filePaths.some(p => p.includes('index.html'))) warnings.push('Missing index.html');
            },
            'react-ts': () => {
                if (!filePaths.some(p => p.includes('App.tsx') || p.includes('App.ts'))) warnings.push('Missing App component');
                if (!filePaths.some(p => p.includes('index.html'))) warnings.push('Missing index.html');
            },
            'nextjs': () => {
                if (!filePaths.some(p => p.includes('layout.tsx'))) warnings.push('Missing layout.tsx');
                if (!filePaths.some(p => p.includes('page.tsx'))) warnings.push('Missing page.tsx');
            },
            'vue': () => {
                if (!filePaths.some(p => p.includes('App.vue'))) warnings.push('Missing App.vue');
                if (!filePaths.some(p => p.includes('main.js') || p.includes('main.ts'))) warnings.push('Missing main.js entry');
            },
            'svelte': () => {
                if (!filePaths.some(p => p.includes('App.svelte'))) warnings.push('Missing App.svelte');
            },
            'angular': () => {
                if (!filePaths.some(p => p.includes('app.component.ts'))) warnings.push('Missing app.component.ts');
                if (!filePaths.some(p => p.includes('main.ts'))) warnings.push('Missing main.ts bootstrap');
            },
            'astro': () => {
                if (!filePaths.some(p => p.includes('.astro'))) warnings.push('Missing .astro page files');
            },
        };

        const check = checks[framework];
        if (check) check();

        // Cross-file import consistency
        for (const [fp, content] of Object.entries(files)) {
            if (typeof content !== 'string') continue;
            const imports = content.match(/(?:import|from)\s+['"]\.\/([^'"]+)['"]/g) || [];
            for (const imp of imports) {
                const match = imp.match(/['"]\.\/([^'"]+)['"]/);
                if (match) {
                    const importedPath = match[1];
                    const dir = path.dirname(fp);
                    const possiblePaths = [
                        path.join(dir, importedPath),
                        path.join(dir, importedPath + '.js'),
                        path.join(dir, importedPath + '.jsx'),
                        path.join(dir, importedPath + '.ts'),
                        path.join(dir, importedPath + '.tsx'),
                        path.join(dir, importedPath + '.vue'),
                        path.join(dir, importedPath + '.svelte'),
                        path.join(dir, importedPath + '/index.js'),
                        path.join(dir, importedPath + '/index.ts'),
                    ].map(p => p.replace(/\\/g, '/'));

                    const exists = possiblePaths.some(pp => filePaths.some(fp2 => fp2 === pp || fp2.endsWith(pp)));
                    if (!exists) {
                        warnings.push(`${fp}: imports '${importedPath}' but file not found in project`);
                    }
                }
            }
        }

        return { isValid: warnings.length === 0, warnings };
    }

    getMetrics() {
        return { ...this.validationMetrics };
    }
}
