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

    validateFile(code, filePath) {
        // Pre-clean code to remove common LLM artifacts
        let cleanCode = code;
        const artifacts = [
            "You are a helpful coding assistant.",
            "You are a code generator. Output ONLY code. Do not output conversational text.",
            "You are a code generator.",
            "Here is the code:",
            "Sure, here is the code:",
            "```html",
            "```css",
            "```javascript",
            "```js",
            "```"
        ];

        artifacts.forEach(artifact => {
            // Case insensitive replacement for text artifacts, exact for markdown
            if (artifact.startsWith("`")) {
                cleanCode = cleanCode.replaceAll(artifact, "");
            } else {
                const regex = new RegExp(artifact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                cleanCode = cleanCode.replace(regex, "");
            }
        });

        cleanCode = cleanCode.trim();

        if (filePath.endsWith('.html')) return { ...this.validateHtml(cleanCode, filePath), fixedCode: cleanCode };
        if (filePath.endsWith('.css')) return { ...this.validateCss(cleanCode, filePath), fixedCode: cleanCode };
        if (filePath.endsWith('.js')) return { ...this.validateJavascript(cleanCode, filePath), fixedCode: cleanCode };
        if (filePath.endsWith('.jsx')) return { ...this.validateJsx(cleanCode, filePath), fixedCode: cleanCode };
        return { isValid: true, errors: [], warnings: [], fixedCode: cleanCode };
    }

    validateHtml(code, filePath = '') {
        const errors = [];
        const warnings = [];
        let fixedCode = code;
        let isValid = true;

        // Check for DOCTYPE
        if (!/<!DOCTYPE\s+html/i.test(code)) {
            errors.push("Missing DOCTYPE declaration");
            fixedCode = `<!DOCTYPE html>\n${fixedCode}`;
        }

        // Check for html tag
        if (!/<html/i.test(code)) {
            errors.push("Missing <html> tag");
            if (fixedCode.includes('<!DOCTYPE')) {
                fixedCode = fixedCode.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<html>');
            } else {
                fixedCode = `<html>\n${fixedCode}`;
            }
            if (!fixedCode.includes('</html>')) {
                fixedCode = `${fixedCode}\n</html>`;
            }
        }

        // Check for head tag
        if (!/<head/i.test(code)) {
            warnings.push("Missing <head> tag");
            if (fixedCode.includes('<body')) {
                fixedCode = fixedCode.replace('<body', '<head>\n</head>\n<body');
            } else if (fixedCode.includes('</html>')) {
                fixedCode = fixedCode.replace('</html>', '<head>\n</head>\n</html>');
            }
        }

        // Check for body tag
        if (!/<body/i.test(code)) {
            warnings.push("Missing <body> tag");
            if (fixedCode.includes('</head>')) {
                fixedCode = fixedCode.replace('</head>', '</head>\n<body>\n');
            }
            if (fixedCode.includes('</html>')) {
                fixedCode = fixedCode.replace('</html>', '</body>\n</html>');
            }
        }

        // Basic structure check
        if (code.trim().length < 50) {
            errors.push("HTML file is too short (likely incomplete)");
        }

        isValid = errors.length === 0;
        return { isValid, errors, warnings, fixedCode: fixedCode !== code ? fixedCode : null };
    }

    validateCss(code, filePath = '') {
        const errors = [];
        const warnings = [];
        let fixedCode = code;
        let isValid = true;

        // Check for unmatched braces
        const openBraces = (code.match(/{/g) || []).length;
        const closeBraces = (code.match(/}/g) || []).length;

        if (openBraces !== closeBraces) {
            errors.push(`Unmatched braces: ${openBraces} opening, ${closeBraces} closing`);
            const diff = openBraces - closeBraces;
            if (diff > 0) {
                fixedCode = code + '\n' + '}'.repeat(diff);
                warnings.push(`Auto-added ${diff} closing brace(s)`);
            }
        }

        if (code.trim().length === 0) {
            warnings.push("CSS file is empty");
        }

        isValid = errors.length === 0;
        return { isValid, errors, warnings, fixedCode: fixedCode !== code ? fixedCode : null };
    }

    validateJavascript(code, filePath = '') {
        const errors = [];
        const warnings = [];
        let fixedCode = null;
        let isValid = true;

        // Basic checks
        const openBraces = (code.match(/{/g) || []).length;
        const closeBraces = (code.match(/}/g) || []).length;
        if (openBraces !== closeBraces) {
            errors.push(`Unmatched braces: ${openBraces} opening, ${closeBraces} closing`);
        }

        const openParens = (code.match(/\(/g) || []).length;
        const closeParens = (code.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
            errors.push(`Unmatched parentheses: ${openParens} opening, ${closeParens} closing`);
        }

        // Syntax validation using node -c
        try {
            // Create temp file
            const tempFile = path.join(__dirname, `temp_${Date.now()}.js`);
            fs.writeFileSync(tempFile, code);
            
            try {
                execSync(`node --check "${tempFile}"`, { stdio: 'pipe' });
            } catch (error) {
                const errorMsg = error.stderr ? error.stderr.toString() : error.message;
                if (errorMsg.includes('SyntaxError')) {
                    errors.push(`Syntax error: ${errorMsg.split('\n')[0]}`);
                } else {
                    errors.push(`JavaScript validation error: ${errorMsg.substring(0, 200)}`);
                }
            } finally {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
            }
        } catch (e) {
            warnings.push(`Could not validate JavaScript: ${e.message}`);
        }

        if (code.trim().length === 0) {
            warnings.push("JavaScript file is empty");
        }

        isValid = errors.length === 0;
        return { isValid, errors, warnings, fixedCode };
    }

    validateJsx(code, filePath = '') {
        const errors = [];
        const warnings = [];
        let fixedCode = code;
        let isValid = true;

        // Check for React import
        if ((code.includes('React') || code.toLowerCase().includes('react')) && 
            !/import\s+.*\s+from\s+['"]react['"]/.test(code)) {
            warnings.push("JSX code should import React");
        }

        // Check for class vs className
        if (code.includes('class=') && !code.includes('className')) {
            warnings.push("Usage of 'class' attribute found in JSX - should be 'className'");
            if (fixedCode.includes('class="')) {
                fixedCode = fixedCode.replace(/class="/g, 'className="');
                warnings.push("Auto-fixed 'class' to 'className'");
            }
        }

        // Check for JSX tags
        if (code.includes('<') && code.includes('>')) {
            const jsxTags = (code.match(/<([A-Z][a-zA-Z0-9]*)[^>]*>/g) || []).length;
            const jsxClosing = (code.match(/<\/([A-Z][a-zA-Z0-9]*)>/g) || []).length;
            
            if (jsxTags !== jsxClosing) {
                warnings.push("Potentially unclosed JSX tags");
            }
        }

        // Use JS validator for syntax
        const jsResult = this.validateJavascript(code, filePath);
        errors.push(...jsResult.errors);
        warnings.push(...jsResult.warnings);

        isValid = errors.length === 0;
        return { isValid, errors, warnings, fixedCode: fixedCode !== code ? fixedCode : null };
    }

    autoFixCommonErrors(code, fileType) {
        const fixesApplied = [];
        let fixedCode = code;

        if (fileType === 'html') {
            if (!/<!DOCTYPE/i.test(fixedCode)) {
                fixedCode = `<!DOCTYPE html>\n${fixedCode}`;
                fixesApplied.push("Added DOCTYPE declaration");
            }
            if (!/<html/i.test(fixedCode)) {
                fixedCode = `<html>\n${fixedCode}\n</html>`;
                fixesApplied.push("Wrapped content in html tags");
            }
        } else if (fileType === 'css' || fileType === 'js' || fileType === 'jsx') {
            const openBraces = (fixedCode.match(/{/g) || []).length;
            const closeBraces = (fixedCode.match(/}/g) || []).length;
            if (openBraces > closeBraces) {
                fixedCode += '\n' + '}'.repeat(openBraces - closeBraces);
                fixesApplied.push(`Added ${openBraces - closeBraces} closing brace(s)`);
            }
        }

        return { fixedCode, fixesApplied };
    }

    validateFile(code, filePath) {
        this.validationMetrics.totalValidations++;
        
        const fileExt = path.extname(filePath).toLowerCase();
        const fileName = path.basename(filePath).toLowerCase();
        
        let result = {
            isValid: false,
            errors: [],
            warnings: [],
            fixedCode: null,
            fixesApplied: [],
            filePath
        };

        try {
            if (fileExt === '.html' || fileName === 'index.html') {
                result = { ...result, ...this.validateHtml(code, filePath) };
            } else if (fileExt === '.css') {
                result = { ...result, ...this.validateCss(code, filePath) };
            } else if (fileExt === '.js') {
                result = { ...result, ...this.validateJavascript(code, filePath) };
            } else if (fileExt === '.jsx' || fileExt === '.tsx') {
                result = { ...result, ...this.validateJsx(code, filePath) };
            } else {
                result.warnings.push(`Unknown file type: ${fileExt}`);
                result.isValid = true;
            }

            // Auto-fix if failed
            if (!result.isValid && !result.fixedCode) {
                const autoFix = this.autoFixCommonErrors(code, fileExt.replace('.', ''));
                if (autoFix.fixesApplied.length > 0) {
                    result.fixedCode = autoFix.fixedCode;
                    result.fixesApplied = autoFix.fixesApplied;
                    // Re-validate would go here ideally
                }
            }

            if (result.isValid) {
                this.validationMetrics.passed++;
            } else {
                this.validationMetrics.failed++;
            }

            if (result.fixesApplied.length > 0 || result.fixedCode) {
                this.validationMetrics.autoFixed++;
            }

        } catch (e) {
            result.errors.push(`Validation error: ${e.message}`);
            this.validationMetrics.failed++;
        }

        return result;
    }
}
