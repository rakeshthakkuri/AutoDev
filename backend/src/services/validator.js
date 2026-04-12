import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';
import config from '../config.js';
import { validateImportResolution, auditPackageDependencies } from './importResolver.js';
import { parseLikeBundler } from './babelParseLikeBundler.js';
import { fixKnownImportCollisions } from './importCollisionFixer.js';

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

        // 1. Strip backticks from URLs globally (common LLM artifact)
        c = c.replace(/`\s*(https?:\/\/[^`\s]+)\s*`/gi, '$1');

        // 2. Strip backticks from URLs in attributes (href, src, action, xmlns, etc.)
        c = c.replace(/(href|src|action|xmlns|data-[\w-]+)\s*=\s*(["'])(.*?)\2/gi, (match, attr, quote, val) => {
            let cleanedVal = val.replace(/`/g, '');
            if (cleanedVal.trim().startsWith('data:')) {
                cleanedVal = cleanedVal.trim();
            } else if (attr === 'src' || attr === 'href' || attr === 'action' || attr === 'xmlns') {
                cleanedVal = cleanedVal.replace(/\s+/g, '');
            } else {
                cleanedVal = cleanedVal.trim();
            }
            return `${attr}=${quote}${cleanedVal}${quote}`;
        });

        // 2.1 Handle single quotes and backticks in style attributes with url()
        c = c.replace(/url\(\s*`\s*([^`\s]+)\s*`\s*\)/gi, 'url($1)');
        c = c.replace(/url\(\s*['"]\s*`\s*([^`\s]+)\s*`\s*['"]\s*\)/gi, 'url($1)');

        // 3. Fix spaces around URLs in attributes that might have been missed
        c = c.replace(/(href|src|action|xmlns)\s*=\s*(["'])\s*(https?:\/\/[^"']+?)\s*\2/gi, '$1=$2$3$2');

        // 4. Fix double encoded quotes in SVG namespaces (e.g., %22 `url%22`)
        c = c.replace(/%22\s*`([^`]+)`\s*%22/gi, '"$1"');
        c = c.replace(/%22\s*([^%]+)\s*%22/gi, '"$1"');

        // 5. Fix nested double quotes in SVG data URIs (common in link/img tags)
        // e.g. href="data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"...>"
        // We use a loop to fix multiple nested attributes. We allow any character in the prefix
        // to handle attributes inside nested tags (like <circle> inside <svg>)
        let prevC;
        do {
            prevC = c;
            c = c.replace(/(data:image\/svg\+xml,.*?)\s+(\w+)\s*=\s*"([^"]*?)"(?=[\s\/>])/gi, "$1 $2='$3'");
        } while (c !== prevC);

        return c.trim();
    }

    /**
     * Count opening and closing brackets, ignoring those inside strings, template literals, and comments.
     */
    _countBrackets(code, openChar, closeChar) {
        let open = 0, close = 0;
        let inSingle = false, inDouble = false, inTemplate = false;
        let inLineComment = false, inBlockComment = false;
        let i = 0;
        const len = code.length;
        while (i < len) {
            const ch = code[i];
            const next = i + 1 < len ? code[i + 1] : '';
            const prev = i > 0 ? code[i - 1] : '';

            if (inBlockComment) {
                if (ch === '*' && next === '/') { inBlockComment = false; i += 2; continue; }
                i++;
                continue;
            }
            if (inLineComment) {
                if (ch === '\n') inLineComment = false;
                i++;
                continue;
            }
            if (inTemplate) {
                if (ch === '`') inTemplate = false;
                else if (ch === '\\') i++;
                i++;
                continue;
            }
            if (inSingle) {
                if (ch === "'" && prev !== '\\') inSingle = false;
                i++;
                continue;
            }
            if (inDouble) {
                if (ch === '"' && prev !== '\\') inDouble = false;
                i++;
                continue;
            }

            if (ch === '/' && next === '*') { inBlockComment = true; i += 2; continue; }
            if (ch === '/' && next === '/') { inLineComment = true; i += 2; continue; }
            if (ch === '`') { inTemplate = true; i++; continue; }
            if (ch === "'") { inSingle = true; i++; continue; }
            if (ch === '"') { inDouble = true; i++; continue; }

            if (ch === openChar) open++;
            if (ch === closeChar) close++;
            i++;
        }
        return { open, close };
    }

    // ─── HTML Validation ────────────────────────────────────────────────

    validateHtml(code, filePath = '', framework = config.defaultFramework) {
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
        if (!/<head/i.test(code)) {
            warnings.push('Missing <head> tag');
            if (fixedCode.includes('<html')) {
                fixedCode = fixedCode.replace(/<html[^>]*>/i, '$& \n<head>\n</head>');
            }
        }
        if (!/<body/i.test(code)) {
            warnings.push('Missing <body> tag');
            if (fixedCode.includes('</head>')) {
                fixedCode = fixedCode.replace('</head>', '</head>\n<body>');
                if (!fixedCode.includes('</body>')) {
                    fixedCode = fixedCode.replace('</html>', '</body>\n</html>');
                }
            }
        }

        // Vanilla JS specific linking checks
        if (framework === config.defaultFramework && filePath.endsWith('index.html')) {
            // Check for CSS link
            if (!/<link\s+[^>]*href=["']styles\.css["']/i.test(fixedCode)) {
                errors.push('Missing link to styles.css');
                if (fixedCode.includes('</head>')) {
                    fixedCode = fixedCode.replace('</head>', '    <link rel="stylesheet" href="styles.css">\n</head>');
                }
            }
            // Check for JS script
            if (!/<script\s+[^>]*src=["']script\.js["']/i.test(fixedCode)) {
                errors.push('Missing script tag for script.js');
                if (fixedCode.includes('</body>')) {
                    fixedCode = fixedCode.replace('</body>', '  <script src="script.js" defer></script>\n</body>');
                } else if (fixedCode.includes('</html>')) {
                    fixedCode = fixedCode.replace('</html>', '  <script src="script.js" defer></script>\n</html>');
                }
            }
        }

        if (code.trim().length < 50) errors.push('HTML file is too short (likely incomplete)');

        return { isValid: errors.length === 0, errors, warnings, fixedCode: fixedCode !== code ? fixedCode : null };
    }

    // ─── CSS / SCSS Validation ──────────────────────────────────────────

    validateCss(code, filePath = '', framework = config.defaultFramework) {
        const errors = [], warnings = [];
        let fixedCode = code;

        // Use the context-aware bracket counter to avoid false positives from
        // braces inside string values like content: '{' or url('...{...')
        const { open, close } = this._countBrackets(code, '{', '}');
        if (open !== close) {
            errors.push(`Unmatched braces: ${open} opening, ${close} closing`);
            if (open > close) {
                // If it ends abruptly, it's likely truncated
                if (fixedCode.trim().endsWith(';') || fixedCode.trim().endsWith('}') || /[\w-]+\s*:\s*[^;]+$/.test(fixedCode.trim())) {
                    fixedCode += '\n' + '}'.repeat(open - close);
                    warnings.push(`Auto-added ${open - close} closing brace(s) for CSS`);
                }
            }
        }

        // Tailwind directives are invalid in vanilla projects without a build step.
        if (framework === config.defaultFramework) {
            const hasTailwindDirectives = /@tailwind\b|@apply\b|@layer\b/.test(code);
            if (hasTailwindDirectives) {
                errors.push('Tailwind directives detected in vanilla-js CSS without build pipeline');
            }
        }

        // Detect and remove empty rules like ".class {}" which often happen during truncation
        const emptyRuleRegex = /[^{}\n]+\s*\{\s*\}/g;
        if (emptyRuleRegex.test(fixedCode)) {
            const matches = fixedCode.match(emptyRuleRegex);
            fixedCode = fixedCode.replace(emptyRuleRegex, '');
            warnings.push(`Removed ${matches.length} empty CSS rule(s)`);
        }

        if (code.trim().length === 0) warnings.push('CSS file is empty');

        return { isValid: errors.length === 0, errors, warnings, fixedCode: fixedCode !== code ? fixedCode : null };
    }

    // ─── Common: Truncation & Unterminated String Detection ───────────

    /**
     * Detect truncated files and unterminated strings — common when LLM
     * output hits the max_tokens limit and gets cut off mid-expression.
     */
    _checkTruncationAndStrings(code, filePath = '') {
        const errors = [];
        const lines = code.split('\n');
        const lineCount = lines.length;

        // 1. Check for unterminated string constants — only flag if near end of file and no closing quote in remaining content
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

            let inSingle = false, inDouble = false, inTemplate = false;
            for (let j = 0; j < line.length; j++) {
                const ch = line[j];
                const prev = j > 0 ? line[j - 1] : '';
                if (prev === '\\') continue;

                if (ch === '`') { inTemplate = !inTemplate; continue; }
                if (inTemplate) continue;

                if (ch === "'" && !inDouble) inSingle = !inSingle;
                if (ch === '"' && !inSingle) inDouble = !inDouble;
            }

            if (inSingle || inDouble) {
                const remainingContent = lines.slice(i + 1).join('\n');
                const hasClosingQuote = inSingle ? remainingContent.includes("'") : remainingContent.includes('"');
                const nearEndOfFile = lineCount - (i + 1) <= 5;
                if (nearEndOfFile && !hasClosingQuote) {
                    errors.push(`Unterminated string constant at line ${i + 1} (file likely truncated by token limit)`);
                } else if (!hasClosingQuote) {
                    errors.push(`Unterminated string constant at line ${i + 1}`);
                }
                break;
            }
        }

        // 2. Check for truncated file — avoid false positives for valid JSX (>, />, ; at end)
        const trimmed = code.trim();
        const lastNonEmptyLine = [...lines].reverse().find(l => l.trim().length > 0)?.trim() || '';

        const endsWithValidJsx = /[>;]\s*$/.test(lastNonEmptyLine) || /\/>\s*$/.test(lastNonEmptyLine);
        const endsWithIncomplete = /[=:,{(\[+\-*\/&|]\s*$/.test(lastNonEmptyLine) && !lastNonEmptyLine.endsWith('=>');
        if (!endsWithValidJsx && endsWithIncomplete) {
            errors.push(`File appears truncated — ends with incomplete expression: "${lastNonEmptyLine.substring(Math.max(0, lastNonEmptyLine.length - 50))}"`);
        }

        // For JSX/TSX/HTML: file should not end with an unclosed tag
        const ext = path.extname(filePath).toLowerCase();
        if (['.jsx', '.tsx', '.html'].includes(ext)) {
            // Check for unclosed JSX return — if we see "return (" we should see a matching ")"
            const returnParens = (code.match(/return\s*\(/g) || []).length;
            const closingParensAfterJsx = (code.match(/^\s*\)\s*;?\s*$/gm) || []).length;
            if (returnParens > closingParensAfterJsx) {
                errors.push('Unclosed JSX return statement — missing closing parenthesis');
            }
        }

        // For JS/TS: file should end with } or ; or ) or valid JSX ending for a complete module
        if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
            if (trimmed.length > 200) {
                const endsReasonably = /[};)\]`'"]$/.test(lastNonEmptyLine) ||
                    /[>;]\s*$/.test(lastNonEmptyLine) ||
                    /\/>\s*$/.test(lastNonEmptyLine) ||
                    lastNonEmptyLine.endsWith('*/') ||
                    lastNonEmptyLine.startsWith('//') ||
                    lastNonEmptyLine.startsWith('export');
                if (!endsReasonably) {
                    errors.push(`File may be truncated — does not end with a complete statement`);
                }
            }
        }

        return errors;
    }

    // ─── JavaScript Validation ──────────────────────────────────────────

    validateJavascript(code, filePath = '') {
        const errors = [], warnings = [];

        const { open: openB, close: closeB } = this._countBrackets(code, '{', '}');
        if (openB !== closeB) errors.push(`Unmatched braces: ${openB} opening, ${closeB} closing`);

        const { open: openP, close: closeP } = this._countBrackets(code, '(', ')');
        if (openP !== closeP) errors.push(`Unmatched parentheses: ${openP} opening, ${closeP} closing`);

        // Truncation and string checks
        errors.push(...this._checkTruncationAndStrings(code, filePath));

        // node --check for .js files (skip for modules with import/export since node may not understand JSX)
        if (!code.includes('import ') && !code.includes('export ')) {
            // Use os.tmpdir() with a random suffix to avoid source-tree pollution and race conditions
            const tempFile = path.join(os.tmpdir(), `validator_${crypto.randomUUID()}.js`);
            try {
                fs.writeFileSync(tempFile, code);
                try {
                    execSync(`node --check "${tempFile}"`, { stdio: 'pipe' });
                } catch (error) {
                    const msg = error.stderr?.toString() || error.message;
                    if (msg.includes('SyntaxError')) errors.push(`Syntax error: ${msg.split('\n')[0]}`);
                } finally {
                    try { fs.unlinkSync(tempFile); } catch (_) { /* already gone */ }
                }
            } catch (_) { /* skip */ }
        }

        if (code.trim().length === 0) warnings.push('JavaScript file is empty');

        return { isValid: errors.length === 0, errors, warnings, fixedCode: null };
    }

    // ─── JSX / TSX Validation ───────────────────────────────────────────
    
    _fixImports(code, filePath = '') {
        let fixedCode = code;
        
        // 1. React Hooks
        const commonHooks = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer', 'useLayoutEffect', 'useId', 'useTransition'];
        const usedHooks = commonHooks.filter(hook => new RegExp(`\\b${hook}\\b`).test(code));
        
        if (usedHooks.length > 0) {
            const hasReactImport = /import\s+.*?React.*?\s+from\s+['"]react['"]/.test(code);
            const hasHooksImport = /import\s+\{([^}]+)\}\s+from\s+['"]react['"]/.test(code);
            
            if (!hasReactImport && !hasHooksImport) {
                fixedCode = `import { ${usedHooks.join(', ')} } from 'react';\n${fixedCode}`;
            } else if (hasHooksImport) {
                const importMatch = fixedCode.match(/import\s+\{([^}]+)\}\s+from\s+['"]react['"]/);
                if (importMatch) {
                    const imported = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
                    const missing = usedHooks.filter(h => !imported.includes(h));
                    if (missing.length > 0) {
                        const newImport = `import { ${[...new Set([...imported, ...missing])].sort().join(', ')} } from 'react'`;
                        fixedCode = fixedCode.replace(importMatch[0], newImport);
                    }
                }
            }
        }

        // 2. Lucide Icons
        const lucideIcons = code.match(/<([A-Z][a-zA-Z0-9]+)\s/g);
        if (lucideIcons) {
            const potentialIcons = lucideIcons.map(m => m.substring(1, m.length - 1));
            const commonIcons = [
                'ChevronRight', 'ChevronLeft', 'ChevronUp', 'ChevronDown', 'Search', 'Menu', 'X', 'Bell', 'Settings', 
                'User', 'Mail', 'Lock', 'Home', 'Plus', 'Trash', 'Edit', 'Download', 'Share', 'ExternalLink', 
                'Check', 'AlertCircle', 'Info', 'ArrowRight', 'ArrowLeft', 'Github', 'Twitter', 'Linkedin', 
                'Facebook', 'Instagram', 'Calendar', 'Clock', 'MapPin', 'Phone', 'Globe', 'Briefcase', 'GraduationCap',
                'Heart', 'Star', 'ShoppingCart', 'CreditCard', 'Eye', 'EyeOff', 'Cloud', 'Moon', 'Sun'
            ];
            const usedIcons = commonIcons.filter(icon => potentialIcons.includes(icon) && !new RegExp(`import\\s+.*?${icon}.*?\\s+from\\s+['"]lucide-react['"]`).test(code));
            
            if (usedIcons.length > 0) {
                const hasLucideImport = /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/.test(code);
                if (!hasLucideImport) {
                    fixedCode = `import { ${usedIcons.join(', ')} } from 'lucide-react';\n${fixedCode}`;
                } else {
                    const importMatch = fixedCode.match(/import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/);
                    const imported = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
                    const missing = usedIcons.filter(h => !imported.includes(h));
                    if (missing.length > 0) {
                        const newImport = `import { ${[...new Set([...imported, ...missing])].sort().join(', ')} } from 'lucide-react'`;
                        fixedCode = fixedCode.replace(importMatch[0], newImport);
                    }
                }
            }
        }

        // 3. Utils (clsx, tailwind-merge)
        if (code.includes('cn(') && !code.includes('import { cn }') && !code.includes('function cn(')) {
            // Usually cn is imported from a local lib or defined locally
            if (!code.includes("from '@/lib/utils'") && !code.includes("from '../lib/utils'")) {
                 // If not found, we don't know where it is, but we can flag it
            }
        }
        
        if (code.includes('twMerge(') && !code.includes("from 'tailwind-merge'")) {
            fixedCode = `import { twMerge } from 'tailwind-merge';\n${fixedCode}`;
        }
        
        if (code.includes('clsx(') && !code.includes("from 'clsx'")) {
            fixedCode = `import { clsx } from 'clsx';\n${fixedCode}`;
        }

        return fixedCode;
    }

    validateJsx(code, filePath = '') {
        const errors = [], warnings = [];
        let fixedCode = code;

        // 1. class → className
        if (code.includes('class=') && !code.includes('className') && !filePath.endsWith('.vue') && !filePath.endsWith('.svelte')) {
            warnings.push("'class' attribute found in JSX — should be 'className'");
            fixedCode = fixedCode.replace(/\bclass="/g, 'className="');
        }

        // 2. onclick → onClick, etc.
        const eventHandlers = ['onclick', 'onchange', 'onsubmit', 'onkeydown', 'onkeyup', 'onmouseenter', 'onmouseleave'];
        eventHandlers.forEach(handler => {
            const regex = new RegExp(`\\b${handler}=`, 'g');
            if (regex.test(fixedCode)) {
                const correct = 'on' + handler.charAt(2).toUpperCase() + handler.slice(3);
                fixedCode = fixedCode.replace(regex, `${correct}=`);
                warnings.push(`Fixed event handler: ${handler} -> ${correct}`);
            }
        });

        // 3. style string → object (simple cases)
        const styleStringRegex = /style="([^"]*)"/g;
        if (styleStringRegex.test(fixedCode)) {
            fixedCode = fixedCode.replace(styleStringRegex, (match, p1) => {
                if (p1.includes('{{')) return match; // Already an object or expression
                const styleObj = p1.split(';').filter(s => s.trim().includes(':')).map(s => {
                    const [prop, ...valParts] = s.split(':');
                    const val = valParts.join(':').trim();
                    const camelProp = prop.trim().replace(/-([a-z])/g, (m, c) => c.toUpperCase());
                    return `${camelProp}: '${val.replace(/'/g, "\\'")}'`;
                }).join(', ');
                return styleObj ? `style={{ ${styleObj} }}` : match;
            });
            if (fixedCode !== code) warnings.push('Converted style string to object in JSX');
        }

        // 4. Accessibility: target="_blank" should have rel="noopener noreferrer"
        const blankLinkRegex = /<a\s+[^>]*target="_blank"[^>]*>/g;
        if (blankLinkRegex.test(fixedCode)) {
            fixedCode = fixedCode.replace(blankLinkRegex, (match) => {
                if (match.includes('rel=')) return match;
                return match.replace('target="_blank"', 'target="_blank" rel="noopener noreferrer"');
            });
            if (fixedCode !== code) warnings.push('Added rel="noopener noreferrer" to target="_blank" links');
        }

        // 5. Missing imports
        const fixedWithImports = this._fixImports(fixedCode, filePath);
        if (fixedWithImports !== fixedCode) {
            fixedCode = fixedWithImports;
            warnings.push('Added missing imports (hooks, icons, or utils)');
        }

        const { open: openB, close: closeB } = this._countBrackets(code, '{', '}');
        if (Math.abs(openB - closeB) > 5) errors.push(`Severely unmatched braces: ${openB} opening, ${closeB} closing`);

        const { open: openP, close: closeP } = this._countBrackets(code, '(', ')');
        if (Math.abs(openP - closeP) > 5) errors.push(`Severely unmatched parentheses: ${openP} opening, ${closeP} closing`);

        // Truncation and unterminated string checks
        errors.push(...this._checkTruncationAndStrings(code, filePath));

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

        const { open: openB, close: closeB } = this._countBrackets(code, '{', '}');
        if (Math.abs(openB - closeB) > 2) errors.push(`Unmatched braces: ${openB} opening, ${closeB} closing`);

        // Truncation and unterminated string checks (for .ts files without .tsx)
        if (!filePath.endsWith('.tsx')) {
            errors.push(...this._checkTruncationAndStrings(code, filePath));
        }

        // Check for common TS issues
        if (code.includes('any') && code.split('any').length > 10) {
            warnings.push('Excessive use of "any" type — consider using specific types');
        }

        return { isValid: errors.length === 0, errors, warnings, fixedCode: fixedCode !== code ? fixedCode : null };
    }

    // ─── Vue SFC Validation ─────────────────────────────────────────────

    validateVue(code, filePath = '') {
        const errors = [], warnings = [];
        let fixedCode = code;

        const hasTemplate = /<template[\s>]/i.test(code);
        const hasScript = /<script/i.test(code);
        const hasStyle = /<style/i.test(code);

        if (!hasTemplate && !hasScript) {
            errors.push('Vue SFC must have at least a <template> or <script> section');
        }
        
        // Auto-fix unclosed tags if they are at the end (truncation)
        if (hasTemplate && !/<\/template>/i.test(fixedCode)) {
            errors.push('Unclosed <template> tag');
            if (fixedCode.trim().endsWith('>') || fixedCode.trim().endsWith('}')) {
                fixedCode += '\n</template>';
                warnings.push('Auto-closed <template> tag');
            }
        }
        if (hasScript && !/<\/script>/i.test(fixedCode)) {
            errors.push('Unclosed <script> tag');
            if (fixedCode.trim().endsWith(';') || fixedCode.trim().endsWith('}')) {
                fixedCode += '\n</script>';
                warnings.push('Auto-closed <script> tag');
            }
        }
        if (hasStyle && !/<\/style>/i.test(fixedCode)) {
            errors.push('Unclosed <style> tag');
            if (fixedCode.trim().endsWith('}')) {
                fixedCode += '\n</style>';
                warnings.push('Auto-closed <style> tag');
            }
        }

        // Check for Composition API usage
        if (hasScript && code.includes('setup')) {
            if (!code.includes('ref') && !code.includes('reactive') && !code.includes('computed')) {
                warnings.push('Script setup detected but no reactivity primitives used');
            }
        }

        return { isValid: errors.length === 0, errors, warnings, fixedCode: fixedCode !== code ? fixedCode : null };
    }

    // ─── Svelte Validation ──────────────────────────────────────────────

    validateSvelte(code, filePath = '') {
        const errors = [], warnings = [];
        let fixedCode = code;

        // Svelte components must have some HTML content
        const hasHtml = /<[a-z][^>]*>/i.test(code);
        const hasScript = /<script/i.test(code);
        const hasStyle = /<style/i.test(code);

        if (!hasHtml && !hasScript) {
            errors.push('Svelte component must have HTML content or a <script> block');
        }
        
        // Auto-fix unclosed tags
        if (hasScript && !/<\/script>/i.test(fixedCode)) {
            errors.push('Unclosed <script> tag');
            if (fixedCode.trim().endsWith(';') || fixedCode.trim().endsWith('}')) {
                fixedCode += '\n</script>';
                warnings.push('Auto-closed <script> tag');
            }
        }
        if (hasStyle && !/<\/style>/i.test(fixedCode)) {
            errors.push('Unclosed <style> tag');
            if (fixedCode.trim().endsWith('}')) {
                fixedCode += '\n</style>';
                warnings.push('Auto-closed <style> tag');
            }
        }

        // Check for common Svelte patterns and auto-fix simple truncation
        if (fixedCode.includes('{#each') && !fixedCode.includes('{/each}')) {
            errors.push('Unclosed {#each} block');
            if (fixedCode.trim().endsWith('}') || fixedCode.trim().endsWith('>')) {
                fixedCode += '\n{/each}';
                warnings.push('Auto-closed {#each} block');
            }
        }
        if (fixedCode.includes('{#if') && !fixedCode.includes('{/if}')) {
            errors.push('Unclosed {#if} block');
            if (fixedCode.trim().endsWith('}') || fixedCode.trim().endsWith('>')) {
                fixedCode += '\n{/if}';
                warnings.push('Auto-closed {#if} block');
            }
        }

        return { isValid: errors.length === 0, errors, warnings, fixedCode: fixedCode !== code ? fixedCode : null };
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

    autoFixCommonErrors(code, fileType, options = {}) {
        const fixes = [];
        let fixed = code;
        const { skipBracePadding = false, maxBraceDelta = 5 } = options;

        if (fileType === 'html') {
            if (!/<!DOCTYPE/i.test(fixed)) { fixed = `<!DOCTYPE html>\n${fixed}`; fixes.push('Added DOCTYPE'); }
            if (!/<html/i.test(fixed)) { fixed = `<html lang="en">\n${fixed}\n</html>`; fixes.push('Wrapped in html tags'); }
        }

        if (!skipBracePadding && ['css', 'scss', 'js', 'jsx', 'ts', 'tsx'].includes(fileType)) {
            const o = (fixed.match(/{/g) || []).length;
            const c = (fixed.match(/}/g) || []).length;
            const delta = o - c;
            if (delta > 0 && delta <= maxBraceDelta) {
                fixed += '\n' + '}'.repeat(delta);
                fixes.push(`Added ${delta} closing brace(s)`);
            } else if (delta > maxBraceDelta) {
                // Large mismatch — likely broken AST; padding braces usually makes it worse
            }
        }

        return { fixedCode: fixed, fixesApplied: fixes };
    }

    /**
     * Whether to run Babel parse (preview parity). Skips CommonJS-only tooling files.
     */
    _shouldBabelParse(filePath, cleanCode) {
        const ext = path.extname(filePath).toLowerCase();
        const fname = path.basename(filePath).toLowerCase();
        if (['.jsx', '.tsx', '.ts'].includes(ext)) return true;
        if (ext === '.js') {
            if (fname.endsWith('.config.js') || /^(webpack|rollup|vite|jest|babel)\.config\b/i.test(fname)) return false;
            const looksEsm = /\b(import\s+|export\s+)/.test(cleanCode) || /<\s*[A-Za-z]/.test(cleanCode);
            return looksEsm;
        }
        return false;
    }

    // ─── Main Entry: Validate File ──────────────────────────────────────

    validateFile(code, filePath, framework = config.defaultFramework) {
        this.validationMetrics.totalValidations++;

        let cleanCode = this._cleanArtifacts(code);
        const ext = path.extname(filePath).toLowerCase();
        const fname = path.basename(filePath).toLowerCase();

        if (ext === '.jsx' || ext === '.tsx') {
            cleanCode = fixKnownImportCollisions(cleanCode);
        }

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
                result = { ...result, ...this.validateHtml(cleanCode, filePath, framework) };
            } else if (ext === '.css' || ext === '.scss') {
                result = { ...result, ...this.validateCss(cleanCode, filePath, framework) };
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

            // Preview parity: same Babel parse bar as Live Preview bundler
            if (this._shouldBabelParse(filePath, cleanCode)) {
                const parsed = parseLikeBundler(cleanCode, filePath);
                if (!parsed.ok && parsed.error) {
                    result.errors.push(`Parse error (preview parity): ${parsed.error}`);
                    result.isValid = false;
                }
            }

            const hadParseError = result.errors.some((e) => typeof e === 'string' && e.startsWith('Parse error (preview parity):'));
            // Auto-fix if failed
            if (!result.isValid && !result.fixedCode) {
                const autoFix = this.autoFixCommonErrors(cleanCode, ext.replace('.', ''), {
                    skipBracePadding: hadParseError,
                    maxBraceDelta: 5,
                });
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
        const landingCandidates = [];
        const cssLikeFiles = [];

        const checks = {
            [config.defaultFramework]: () => {
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
            const extForQuality = path.extname(fp).toLowerCase();
            if (['.css', '.scss'].includes(extForQuality)) {
                cssLikeFiles.push({ fp, content });
            }
            if (this._looksLikeLandingEntry(fp, content)) {
                landingCandidates.push({ fp, content });
            }

            // Match all relative imports: import ... from './path' or require('./path')
            const importPatterns = [
                /(?:import|from)\s+['"]\.\.?\/([^'"]+)['"]/g,
                /require\(\s*['"]\.\.?\/([^'"]+)['"]\s*\)/g,
            ];

            for (const pattern of importPatterns) {
                let imp;
                while ((imp = pattern.exec(content)) !== null) {
                    const importedPath = imp[1];
                    const dir = path.dirname(fp);
                    const possiblePaths = [
                        path.join(dir, importedPath),
                        path.join(dir, importedPath + '.js'),
                        path.join(dir, importedPath + '.jsx'),
                        path.join(dir, importedPath + '.ts'),
                        path.join(dir, importedPath + '.tsx'),
                        path.join(dir, importedPath + '.vue'),
                        path.join(dir, importedPath + '.svelte'),
                        path.join(dir, importedPath + '.astro'),
                        path.join(dir, importedPath + '.css'),
                        path.join(dir, importedPath + '.scss'),
                        path.join(dir, importedPath + '/index.js'),
                        path.join(dir, importedPath + '/index.ts'),
                        path.join(dir, importedPath + '/index.tsx'),
                    ].map(p => p.replace(/\\/g, '/'));

                    const exists = possiblePaths.some(pp =>
                        filePaths.some(fp2 => fp2 === pp || fp2.endsWith(pp))
                    );
                    if (!exists) {
                        warnings.push(`${fp}: imports './${importedPath}' but file not found in project`);
                    }
                }
            }

            // Check for default export consistency in JS/TS/JSX/TSX files
            const ext = path.extname(fp).toLowerCase();
            if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
                // Files that are imported as default should have a default export
                const isImportedAsDefault = filePaths.some(otherFp => {
                    if (otherFp === fp) return false;
                    const otherContent = files[otherFp];
                    if (typeof otherContent !== 'string') return false;
                    const baseName = path.basename(fp, ext);
                    // Check: import Something from './path/Component'
                    const defaultImportRe = new RegExp(
                        `import\\s+[A-Z]\\w*\\s+from\\s+['"][^'"]*${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`
                    );
                    return defaultImportRe.test(otherContent);
                });

                if (isImportedAsDefault) {
                    const hasDefaultExport = /export\s+default\b/.test(content) ||
                        /module\.exports\s*=/.test(content);
                    if (!hasDefaultExport) {
                        warnings.push(`${fp}: imported as default by another file but has no default export`);
                    }
                }

                // JSX/TSX: warn if file imports a CSS file that is missing
                if (['.jsx', '.tsx'].includes(ext)) {
                    const cssImportMatches = content.matchAll(/import\s+['"](\.\.?\/[^'"]+\.(?:css|scss))['"]\s*;?/g);
                    for (const m of cssImportMatches) {
                        const importedPath = m[1];
                        const dir = path.dirname(fp);
                        const resolved = path.join(dir, importedPath).replace(/\\/g, '/');
                        const exists = filePaths.some(p => p === resolved || p.endsWith(importedPath));
                        if (!exists) {
                            warnings.push(`${fp}: imports '${importedPath}' but file not found in project`);
                        }
                    }
                }
            }

            // Check HTML files reference existing CSS/JS files via <link> or <script>
            if (ext === '.html') {
                // Check <link href="./styles.css"> references
                const linkRefs = content.match(/(?:href|src)=["'](?!https?:\/\/|\/\/|#|mailto:|data:)([^"']+)["']/g) || [];
                for (const ref of linkRefs) {
                    const refMatch = ref.match(/(?:href|src)=["']([^"']+)["']/);
                    if (refMatch) {
                        const refPath = refMatch[1];
                        // Skip anchors, absolute URLs, data URIs
                        if (refPath.startsWith('#') || refPath.startsWith('http') || refPath.startsWith('data:') || refPath.startsWith('/src/')) continue;
                        const dir = path.dirname(fp);
                        const resolvedRef = path.join(dir, refPath).replace(/\\/g, '/');
                        const exists = filePaths.some(fp2 => fp2 === resolvedRef || fp2 === refPath || fp2.endsWith(refPath));
                        if (!exists && !refPath.includes('fonts.googleapis') && !refPath.includes('cdn')) {
                            warnings.push(`${fp}: references '${refPath}' but file not found in project`);
                        }
                    }
                }
            }
        }

        // Landing-page quality checks
        for (const { fp, content } of landingCandidates) {
            const sectionCount = (content.match(/<section\b/gi) || []).length;
            if (sectionCount < 4) {
                warnings.push(`${fp}: landing page has only ${sectionCount} section(s); target at least 4-6 meaningful sections`);
            }

            const hasMain = /<main[\s>]/i.test(content);
            const hasHeader = /<header[\s>]/i.test(content);
            const hasFooter = /<footer[\s>]/i.test(content);
            if (!(hasMain && hasHeader && hasFooter)) {
                warnings.push(`${fp}: landing page should include semantic landmarks (header, main, footer)`);
            }

            const hasH1 = /<h1[\s>]/i.test(content);
            const hasH2 = /<h2[\s>]/i.test(content);
            if (!hasH1 || !hasH2) {
                warnings.push(`${fp}: weak heading hierarchy; include clear h1 and supporting h2 sections`);
            }

            const inlineStyleCount = (content.match(/\sstyle=\s*["'{]/gi) || []).length;
            if (inlineStyleCount > 4) {
                warnings.push(`${fp}: excessive inline styles (${inlineStyleCount}); prefer tokenized classes/stylesheets`);
            }
        }

        for (const { fp, content } of cssLikeFiles) {
            const hasMediaQuery = /@media\s*\(/i.test(content);
            if (!hasMediaQuery) {
                warnings.push(`${fp}: missing responsive media queries`);
            }

            const hardcodedColorCount = (
                content.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || []
            ).length;
            const tokenColorCount = (content.match(/var\(--[^)]+\)/g) || []).length;
            if (hardcodedColorCount > 18 && tokenColorCount < 5) {
                warnings.push(`${fp}: many hardcoded color values with low token usage; move to design tokens`);
            }
        }

        // React/components: warn when multiple files define the same component name
        const componentNameToFiles = {};
        for (const fp of filePaths) {
            const ext = path.extname(fp).toLowerCase();
            if (!['.js', '.jsx', '.ts', '.tsx'].includes(ext)) continue;
            const content = files[fp];
            if (typeof content !== 'string') continue;
            let name = null;
            const defaultExportMatch = content.match(/export\s+default\s+(?:function\s+)?(?:class\s+)?(\w+)/);
            if (defaultExportMatch) name = defaultExportMatch[1];
            else {
                const defaultRefMatch = content.match(/export\s+default\s+(\w+)\s*;?/);
                if (defaultRefMatch) name = defaultRefMatch[1];
                else {
                    const funcMatch = content.match(/(?:function|const|var|let)\s+(\w+)\s*[=(]/);
                    if (funcMatch) name = funcMatch[1];
                }
            }
            if (!name) continue;
            if (!componentNameToFiles[name]) componentNameToFiles[name] = [];
            componentNameToFiles[name].push(fp);
        }
        for (const [name, fileList] of Object.entries(componentNameToFiles)) {
            if (fileList.length > 1) {
                warnings.push(`Multiple files define component "${name}": ${fileList.join(', ')}`);
            }
        }

        return { isValid: warnings.length === 0, warnings };
    }

    _looksLikeLandingEntry(filePath, content) {
        const ext = path.extname(filePath).toLowerCase();
        if (!['.html', '.jsx', '.tsx', '.vue', '.svelte', '.astro'].includes(ext)) {
            return false;
        }

        const lowerPath = filePath.toLowerCase();
        const likelyEntry = lowerPath.includes('index') || lowerPath.includes('app') || lowerPath.includes('page');
        if (!likelyEntry) return false;

        const lowerContent = content.toLowerCase();
        const landingSignals = ['hero', 'features', 'testimonial', 'pricing', 'cta', 'landing'];
        const signalHits = landingSignals.filter(signal => lowerContent.includes(signal)).length;
        return signalHits >= 2;
    }

    getMetrics() {
        return { ...this.validationMetrics };
    }

    /**
     * Cross-file import resolution + package.json audit (static analysis).
     * @param {Record<string, string>} projectFiles
     */
    validateProjectImports(projectFiles) {
        const importIssues = validateImportResolution(projectFiles);
        const { missing: missingDeps } = auditPackageDependencies(projectFiles);

        return {
            importIssues,
            missingPackages: missingDeps,
            hasErrors: importIssues.filter(i => i.severity === 'error').length > 0 || missingDeps.length > 0,
            summary: {
                importErrors: importIssues.filter(i => i.type === 'FILE_NOT_FOUND').length,
                missingExports: importIssues.filter(i => i.type !== 'FILE_NOT_FOUND').length,
                missingPackages: missingDeps.length,
            },
        };
    }
}
