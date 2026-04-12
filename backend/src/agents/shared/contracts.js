import path from 'path';

/**
 * Extract the public interface (contract) of a file by parsing its content.
 * Uses regex-based extraction (fast, no AST dependency).
 *
 * @param {string} content - File source code
 * @param {string} filePath - File path for extension detection
 * @returns {{ exports: string[], defaultExport: string|null, imports: string[], props: string[]|null, hooks: string[] }}
 */
export function extractContracts(content, filePath) {
    if (!content || typeof content !== 'string') {
        return { exports: [], defaultExport: null, imports: [], props: null, hooks: [] };
    }

    const ext = path.extname(filePath).toLowerCase();

    if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(ext)) {
        return extractJSContracts(content);
    }
    if (ext === '.vue') {
        return extractVueContracts(content);
    }
    if (ext === '.svelte') {
        return extractSvelteContracts(content);
    }
    if (ext === '.css' || ext === '.scss') {
        return extractCSSContracts(content);
    }
    if (filePath.endsWith('package.json')) {
        return extractPackageContracts(content);
    }

    return { exports: [], defaultExport: null, imports: [], props: null, hooks: [] };
}

/**
 * Extract contracts from JavaScript/TypeScript/JSX/TSX files.
 */
function extractJSContracts(content) {
    const contracts = {
        exports: [],
        defaultExport: null,
        imports: [],
        props: null,
        hooks: [],
    };

    // Named exports: export const/let/function/class/type/interface Name
    const namedExportRe = /export\s+(?:const|let|var|function|class|type|interface)\s+(\w+)/g;
    let match;
    while ((match = namedExportRe.exec(content))) {
        contracts.exports.push(match[1]);
    }

    // export { A, B, C }
    const reExportRe = /export\s*\{([^}]+)\}/g;
    while ((match = reExportRe.exec(content))) {
        const names = match[1].split(',').map(n => {
            const parts = n.trim().split(/\s+as\s+/);
            return (parts[1] || parts[0]).trim();
        }).filter(Boolean);
        contracts.exports.push(...names);
    }

    // Default export: export default function Name / export default class Name / export default Name
    const defaultFuncRe = /export\s+default\s+(?:function|class)\s+(\w+)/;
    const defaultNameRe = /export\s+default\s+(\w+)\s*;/;
    const defaultFuncMatch = content.match(defaultFuncRe);
    const defaultNameMatch = content.match(defaultNameRe);
    if (defaultFuncMatch) {
        contracts.defaultExport = defaultFuncMatch[1];
    } else if (defaultNameMatch && defaultNameMatch[1] !== 'function' && defaultNameMatch[1] !== 'class') {
        contracts.defaultExport = defaultNameMatch[1];
    }

    // CommonJS: module.exports = ... (config files like next.config.js, tailwind.config.js)
    if (!contracts.defaultExport) {
        const cjsRe = /module\.exports\s*=/;
        if (cjsRe.test(content)) {
            contracts.defaultExport = 'module.exports';
        }
    }

    // Imports: import ... from 'path'
    const importRe = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
    while ((match = importRe.exec(content))) {
        contracts.imports.push(match[1]);
    }
    // Dynamic imports
    const dynImportRe = /import\s*\(\s*['"](.+?)['"]\s*\)/g;
    while ((match = dynImportRe.exec(content))) {
        contracts.imports.push(match[1]);
    }

    // Component props — destructured parameter: function Comp({ title, subtitle, onClick })
    const propsRe = /(?:function|const)\s+\w+\s*(?::\s*\w+\s*)?\(\s*\{([^}]*)\}/;
    const propsMatch = content.match(propsRe);
    if (propsMatch) {
        contracts.props = propsMatch[1]
            .split(',')
            .map(p => p.trim().split(/[=:]/)[0].trim())
            .filter(p => p && !p.startsWith('//') && !p.startsWith('/*'));
    }

    // TypeScript interface props: interface Props { title: string; ... }
    const interfaceRe = /interface\s+\w*Props\w*\s*\{([^}]*)\}/;
    const interfaceMatch = content.match(interfaceRe);
    if (interfaceMatch && !contracts.props) {
        contracts.props = interfaceMatch[1]
            .split(/[;\n]/)
            .map(line => line.trim().split(/[?:]/)[0].trim())
            .filter(p => p && !p.startsWith('//') && !p.startsWith('/*'));
    }

    // Hooks used
    const hooksRe = /\b(use[A-Z]\w+)\s*\(/g;
    const hooksSet = new Set();
    while ((match = hooksRe.exec(content))) {
        hooksSet.add(match[1]);
    }
    contracts.hooks = [...hooksSet];

    // Deduplicate exports
    contracts.exports = [...new Set(contracts.exports)];

    return contracts;
}

/**
 * Extract contracts from Vue SFC files.
 */
function extractVueContracts(content) {
    const contracts = {
        exports: [],
        defaultExport: null,
        imports: [],
        props: null,
        hooks: [],
    };

    // Component name from filename is the default export
    // defineProps
    const definePropsRe = /defineProps\s*(?:<[^>]+>)?\s*\(\s*\{([^}]*)\}/;
    const propsMatch = content.match(definePropsRe);
    if (propsMatch) {
        contracts.props = propsMatch[1]
            .split(/[,\n]/)
            .map(line => line.trim().split(/[?:]/)[0].trim())
            .filter(p => p && !p.startsWith('//'));
    }

    // Script setup imports
    const importRe = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
    let match;
    while ((match = importRe.exec(content))) {
        contracts.imports.push(match[1]);
    }

    // defineEmits
    const emitsRe = /defineEmits\s*(?:<[^>]+>)?\s*\(\s*\[([^\]]*)\]/;
    const emitsMatch = content.match(emitsRe);
    if (emitsMatch) {
        const emits = emitsMatch[1].split(',').map(e => e.trim().replace(/['"]/g, '')).filter(Boolean);
        contracts.exports.push(...emits.map(e => `emit:${e}`));
    }

    return contracts;
}

/**
 * Extract contracts from Svelte files.
 */
function extractSvelteContracts(content) {
    const contracts = {
        exports: [],
        defaultExport: null,
        imports: [],
        props: null,
        hooks: [],
    };

    // export let propName
    const propRe = /export\s+let\s+(\w+)/g;
    let match;
    const props = [];
    while ((match = propRe.exec(content))) {
        props.push(match[1]);
        contracts.exports.push(match[1]);
    }
    if (props.length > 0) contracts.props = props;

    // Imports
    const importRe = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
    while ((match = importRe.exec(content))) {
        contracts.imports.push(match[1]);
    }

    return contracts;
}

/**
 * Extract contracts from CSS/SCSS files.
 */
function extractCSSContracts(content) {
    const contracts = {
        exports: [],
        defaultExport: null,
        imports: [],
        props: null,
        hooks: [],
    };

    // CSS custom properties (variables)
    const varRe = /--[\w-]+/g;
    let match;
    const vars = new Set();
    while ((match = varRe.exec(content))) {
        vars.add(match[0]);
    }
    contracts.exports = [...vars].slice(0, 30); // Cap to avoid bloat

    // @import rules
    const importRe = /@import\s+['"](.+?)['"]/g;
    while ((match = importRe.exec(content))) {
        contracts.imports.push(match[1]);
    }

    return contracts;
}

/**
 * Extract contracts from package.json.
 */
function extractPackageContracts(content) {
    const contracts = {
        exports: [],
        defaultExport: null,
        imports: [],
        props: null,
        hooks: [],
    };

    try {
        const pkg = JSON.parse(content);
        if (pkg.dependencies) contracts.exports.push(...Object.keys(pkg.dependencies));
        if (pkg.devDependencies) contracts.exports.push(...Object.keys(pkg.devDependencies));
        if (pkg.scripts) contracts.imports = Object.keys(pkg.scripts);
    } catch {
        // Invalid JSON
    }

    return contracts;
}

/**
 * Format a contract as a compact string for inclusion in LLM prompts.
 */
export function formatContractCompact(contracts) {
    if (!contracts) return 'no contract';
    const parts = [];
    if (contracts.defaultExport) parts.push(`default: ${contracts.defaultExport}`);
    if (contracts.exports?.length) parts.push(`exports: [${contracts.exports.join(', ')}]`);
    if (contracts.props?.length) parts.push(`props: [${contracts.props.join(', ')}]`);
    return parts.join(' | ') || 'empty';
}

/**
 * Format a full contract with abbreviated code for direct dependency context.
 */
export function formatContractFull(record) {
    const parts = [];
    const c = record.contracts || {};

    if (c.defaultExport) parts.push(`Default export: ${c.defaultExport}`);
    if (c.exports?.length) parts.push(`Named exports: ${c.exports.join(', ')}`);
    if (c.props?.length) parts.push(`Props: { ${c.props.join(', ')} }`);
    if (c.hooks?.length) parts.push(`Hooks: ${c.hooks.join(', ')}`);

    // Include abbreviated content for direct dependencies
    if (record.content) {
        const lines = record.content.split('\n');
        const abbreviated = lines.slice(0, 40).join('\n');
        const suffix = lines.length > 40 ? `\n// ... (${lines.length - 40} more lines)` : '';
        parts.push('```\n' + abbreviated + suffix + '\n```');
    }

    return parts.join('\n');
}

// ─── Compressed contract summaries (two-tier context) ─────────────────────

function extractDefaultExportName(code) {
    const m1 = code.match(/export\s+default\s+function\s+(\w+)/);
    if (m1) return m1[1];
    const m2 = code.match(/export\s+default\s+class\s+(\w+)/);
    if (m2) return m2[1];
    const m3 = code.match(/export\s+default\s+(\w+)\s*[;,\n]/);
    if (m3 && !['function', 'class', 'new', 'async'].includes(m3[1])) return m3[1];
    return null;
}

function extractNamedExportsList(code) {
    const names = new Set();
    const re1 = /export\s+(?:async\s+)?(?:function|const|let|var|class|enum)\s+(\w+)/g;
    let m;
    while ((m = re1.exec(code)) !== null) names.add(m[1]);
    const re2 = /export\s+\{([^}]+)\}/g;
    while ((m = re2.exec(code)) !== null) {
        m[1].split(',').forEach(name => {
            const clean = name.replace(/\s+as\s+\w+/, '').trim();
            if (clean) names.add(clean);
        });
    }
    const re3 = /export\s+type\s+\{([^}]+)\}/g;
    while ((m = re3.exec(code)) !== null) {
        m[1].split(',').forEach(name => names.add(name.trim()));
    }
    return [...names].filter(Boolean).slice(0, 10);
}

function extractFunctionSignatures(code) {
    const sigs = [];
    const seen = new Set();
    // Top-level and nested function declarations (export optional; includes login/logout inside hooks)
    const re = /\b(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]{0,80})\)/g;
    let m;
    while ((m = re.exec(code)) !== null) {
        const name = m[1];
        if (seen.has(name)) continue;
        seen.add(name);
        const params = (m[2] || '').replace(/\s+/g, ' ').trim();
        sigs.push(`${name}(${params.slice(0, 40)}${params.length > 40 ? '...' : ''})`);
    }
    const re2 = /export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]{0,60})\)\s*=>/g;
    while ((m = re2.exec(code)) !== null) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        sigs.push(`${m[1]}(${m[2].trim()})`);
    }
    return sigs.slice(0, 8);
}

function extractComponentProps(code) {
    const props = new Set();
    const re = /function\s+\w+\s*\(\s*\{([^}]{0,200})\}/;
    const m = code.match(re);
    if (m) {
        m[1].split(',').forEach(p => {
            const name = p.trim().split(/[=:]/)[0].trim().replace(/[^a-zA-Z0-9_]/g, '');
            if (name && !name.includes(' ')) props.add(name);
        });
    }
    const re2 = /propTypes\s*=\s*\{([^}]{0,200})\}/;
    const m2 = code.match(re2);
    if (m2) {
        m2[1].split(',').forEach(p => {
            const name = p.trim().split(':')[0].trim();
            if (name && /^\w+$/.test(name)) props.add(name);
        });
    }
    return [...props].slice(0, 8);
}

function extractTypeNames(code) {
    const names = [];
    const re = /(?:export\s+)?(?:type|interface)\s+(\w+)/g;
    let m;
    while ((m = re.exec(code)) !== null) names.push(m[1]);
    return names.slice(0, 5);
}

/**
 * Compact summary of a file's public API for tier-2 context.
 */
export function compressContract(filePath, code) {
    if (!code || typeof code !== 'string') return `${filePath}: (empty)`;

    const lines = [];
    const filename = filePath.split('/').pop();

    const defaultExport = extractDefaultExportName(code);
    if (defaultExport) lines.push(`default: ${defaultExport}`);

    const namedExports = extractNamedExportsList(code);
    if (namedExports.length > 0) lines.push(`named: [${namedExports.join(', ')}]`);

    const signatures = extractFunctionSignatures(code);
    if (signatures.length > 0) lines.push(`functions: ${signatures.join(', ')}`);

    const props = extractComponentProps(code);
    if (props.length > 0) lines.push(`props: ${props.join(', ')}`);

    const types = extractTypeNames(code);
    if (types.length > 0) lines.push(`types: ${types.join(', ')}`);

    const summary = lines.length > 0 ? lines.join(' | ') : 'no public exports detected';

    return `${filename}: ${summary}`;
}

/**
 * @param {Record<string, string>} generatedFiles
 * @returns {Map<string, string>}
 */
export function buildCompressedRegistry(generatedFiles) {
    const registry = new Map();
    for (const [filePath, code] of Object.entries(generatedFiles)) {
        registry.set(filePath, compressContract(filePath, code));
    }
    return registry;
}
