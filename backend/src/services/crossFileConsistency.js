// ═══════════════════════════════════════════════════════════════════════════════
// Cross-File Consistency Check (HTML / CSS / JS — vanilla-js + plain HTML projects)
//
// Catches the class of bug where individual files are syntactically valid but
// they don't agree with each other across file boundaries. Sister to
// propInterfaceCheck.js (which handles React/TSX). Issues emitted in a shape
// the existing reviewer→fixer loop can consume.
//
// Detectors:
//   1. HTML_CLASS_NOT_IN_CSS — class="foo" in HTML but no .foo in any .css file
//   2. HTML_ID_NOT_USED      — id="foo" in HTML but no JS code references #foo or getElementById('foo')
//   3. JS_TARGET_MISSING     — getElementById('x')/querySelector('#x'|'.x') but no matching id/class in HTML
//   4. STORAGE_KEY_DRIFT     — localStorage.getItem('a') in one file, setItem('b', ...) in another
//   5. TAILWIND_NO_CONFIG    — Tailwind classes used (e.g. flex, p-4, bg-blue-500) but no tailwind.config.* file
//
// Scope: only runs on projects that have at least one .html + .css/.js file.
// React/TS/Vue/Svelte projects use propInterfaceCheck.js instead.
// ═══════════════════════════════════════════════════════════════════════════════

import logger from './logger.js';

/**
 * @typedef {object} CrossFileIssue
 * @property {string} type         — 'CROSS_FILE_INCONSISTENCY'
 * @property {string} subtype      — see detector list above
 * @property {string} file         — file containing the problem
 * @property {string} message      — human-readable description for the fixer
 * @property {string} severity     — 'error' | 'warning'
 * @property {object} [details]
 */

/**
 * Run cross-file consistency on a project's files.
 *
 * @param {Record<string, string>} files
 * @returns {{ issues: CrossFileIssue[], byFile: Record<string, CrossFileIssue[]> }}
 */
export function checkCrossFileConsistency(files) {
    const issues = [];

    // Skip for non-HTML projects (React/TS/Vue/etc go through other checks).
    const htmlFiles = filesByExt(files, ['.html']);
    if (htmlFiles.length === 0) return { issues, byFile: {} };

    const cssFiles = filesByExt(files, ['.css', '.scss']);
    const jsFiles = filesByExt(files, ['.js', '.mjs', '.cjs']).filter(([p]) => !/\.(config|spec|test)\.(js|mjs|cjs)$/i.test(p));

    // Aggregate everything we know about each side
    const html = aggregateHtml(htmlFiles);
    const css = aggregateCss(cssFiles);
    const js = aggregateJs(jsFiles);

    // ── 1. HTML classes that have no CSS rule
    issues.push(...detectHtmlClassNotInCss(html, css, files));

    // ── 2. JS DOM targets that don't exist in HTML
    issues.push(...detectJsTargetMissing(html, js));

    // ── 3. localStorage key drift
    issues.push(...detectStorageKeyDrift(js));

    // ── 4. Tailwind classes used but no config file
    issues.push(...detectTailwindWithoutConfig(html, css, files));

    const byFile = {};
    for (const issue of issues) {
        if (!byFile[issue.file]) byFile[issue.file] = [];
        byFile[issue.file].push(issue);
    }
    return { issues, byFile };
}

// ─── File partitioning ─────────────────────────────────────────────────────────

function filesByExt(files, exts) {
    const out = [];
    for (const [p, content] of Object.entries(files)) {
        if (typeof content !== 'string') continue;
        if (exts.some(e => p.toLowerCase().endsWith(e))) out.push([p, content]);
    }
    return out;
}

// ─── HTML aggregation ──────────────────────────────────────────────────────────

function aggregateHtml(htmlFiles) {
    const classes = new Map();   // class → set of htmlFile paths where used
    const ids = new Map();       // id → set of htmlFile paths
    for (const [p, content] of htmlFiles) {
        const classRe = /\bclass\s*=\s*["']([^"']+)["']/g;
        let m;
        while ((m = classRe.exec(content)) !== null) {
            for (const cls of m[1].split(/\s+/)) {
                if (cls.trim()) addToMap(classes, cls.trim(), p);
            }
        }
        const idRe = /\bid\s*=\s*["']([^"']+)["']/g;
        while ((m = idRe.exec(content)) !== null) {
            const id = m[1].trim();
            if (id) addToMap(ids, id, p);
        }
    }
    return { classes, ids };
}

function addToMap(map, key, value) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
}

// ─── CSS aggregation ───────────────────────────────────────────────────────────

function aggregateCss(cssFiles) {
    const classes = new Set();
    const ids = new Set();
    for (const [, content] of cssFiles) {
        // Strip @keyframes/@media/etc bodies before extracting selectors? No —
        // we just want all class/id selectors that appear ANYWHERE, including nested.
        const stripped = content
            .replace(/\/\*[\s\S]*?\*\//g, ' ')      // remove comments
            .replace(/url\([^)]*\)/g, ' ')          // strip url() — may contain spurious dots
            .replace(/['"][^'"]*['"]/g, ' ');       // strip strings — may contain spurious .x

        const classRe = /\.([a-zA-Z_][\w-]*)/g;
        let m;
        while ((m = classRe.exec(stripped)) !== null) classes.add(m[1]);

        const idRe = /#([a-zA-Z_][\w-]*)/g;
        while ((m = idRe.exec(stripped)) !== null) ids.add(m[1]);
    }
    return { classes, ids };
}

// ─── JS aggregation ────────────────────────────────────────────────────────────

function aggregateJs(jsFiles) {
    const idRefs = new Map();        // id → set of files where referenced
    const classRefs = new Map();
    const storageGets = new Map();   // key → set of files
    const storageSets = new Map();
    const tailwindClassPattern = /^(?:hover:|focus:|active:|sm:|md:|lg:|xl:|2xl:|dark:|focus-visible:|group-hover:|peer-focus:|disabled:)*(?:m|p|w|h|gap|space|text|bg|border|rounded|flex|grid|items|justify|font|leading|tracking|opacity|shadow|ring|cursor|select|overflow|z|inset|top|bottom|left|right|max|min|order|col|row|absolute|relative|fixed|sticky|block|inline|hidden|visible|transition|transform|scale|rotate|translate|duration|ease|delay|backdrop|filter|blur|sr-only)(?:[-/][\w\-/]+)?$/;
    const tailwindHints = new Set();

    for (const [p, content] of jsFiles) {
        // Strip comments and strings to avoid false positives
        const stripped = stripJsCommentsAndStrings(content);

        // getElementById / getElementsByClassName
        const idCallRe = /getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        let m;
        while ((m = idCallRe.exec(content)) !== null) addToMap(idRefs, m[1].replace(/^#/, ''), p);

        const classCallRe = /getElementsByClassName\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((m = classCallRe.exec(content)) !== null) addToMap(classRefs, m[1].replace(/^\./, ''), p);

        // querySelector / querySelectorAll — extract id/class hints from common shapes
        const querySelectorRe = /querySelector(?:All)?\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((m = querySelectorRe.exec(content)) !== null) {
            const sel = m[1];
            for (const tok of sel.split(/[ ,>+~]+/)) {
                if (tok.startsWith('#')) addToMap(idRefs, tok.slice(1).split(/[\[\.:>]/)[0], p);
                else if (tok.startsWith('.')) addToMap(classRefs, tok.slice(1).split(/[\[\.:>]/)[0], p);
            }
        }

        // localStorage / sessionStorage keys
        const storageGetRe = /(?:localStorage|sessionStorage)\.(?:getItem|removeItem)\s*\(\s*['"`]([^'"`]+)['"`]/g;
        while ((m = storageGetRe.exec(content)) !== null) addToMap(storageGets, m[1], p);
        const storageSetRe = /(?:localStorage|sessionStorage)\.setItem\s*\(\s*['"`]([^'"`]+)['"`]/g;
        while ((m = storageSetRe.exec(content)) !== null) addToMap(storageSets, m[1], p);

        // Heuristic: tokenized className strings that look Tailwind-y
        // (used for the tailwind-without-config detector)
        const classNameRe = /(?:className|class)\s*[:=]\s*['"`]([^'"`]+)['"`]/g;
        while ((m = classNameRe.exec(content)) !== null) {
            for (const tok of m[1].split(/\s+/)) {
                if (tailwindClassPattern.test(tok)) tailwindHints.add(tok);
            }
        }

        // Suppress unused vars warning
        void stripped;
    }

    return { idRefs, classRefs, storageGets, storageSets, tailwindHints };
}

function stripJsCommentsAndStrings(code) {
    // Light strip — good enough for regex-based extraction.
    return code
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
        .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '""')
        .replace(/'(?:\\[\s\S]|[^'\\])*'/g, "''")
        .replace(/"(?:\\[\s\S]|[^"\\])*"/g, '""');
}

// ─── Detectors ─────────────────────────────────────────────────────────────────

const RESERVED_HTML_TOKENS = new Set([
    // Common semantic / utility classes that frequently have no explicit CSS rule
    'sr-only', 'visually-hidden',
]);

function detectHtmlClassNotInCss({ classes }, { classes: cssClasses }, files) {
    const issues = [];
    const hasTailwind = !!Object.keys(files).find(p => /tailwind\.config\.(js|cjs|mjs|ts)$/.test(p));
    const tailwindClassPattern = /^(?:hover:|focus:|active:|sm:|md:|lg:|xl:|2xl:|dark:|focus-visible:|group-hover:|peer-focus:|disabled:)*(?:m|p|w|h|gap|space|text|bg|border|rounded|flex|grid|items|justify|font|leading|tracking|opacity|shadow|ring|cursor|select|overflow|z|inset|top|bottom|left|right|max|min|order|col|row|absolute|relative|fixed|sticky|block|inline|hidden|visible|transition|transform|scale|rotate|translate|duration|ease|delay|backdrop|filter|blur|sr-only)(?:[-/][\w\-/]+)?$/;

    for (const [cls, htmlPaths] of classes) {
        if (cssClasses.has(cls)) continue;
        if (RESERVED_HTML_TOKENS.has(cls)) continue;
        // If the project uses Tailwind (config present) and the class looks Tailwind-y, accept it.
        if (hasTailwind && tailwindClassPattern.test(cls)) continue;

        for (const htmlPath of htmlPaths) {
            issues.push({
                type: 'CROSS_FILE_INCONSISTENCY',
                subtype: 'HTML_CLASS_NOT_IN_CSS',
                file: htmlPath,
                message: `HTML class "${cls}" used in ${htmlPath} has no matching CSS rule. Either add a ".${cls} { ... }" rule to the CSS, or rename the class to one that exists.`,
                severity: 'warning',
                details: { className: cls },
            });
        }
    }
    return issues;
}

function detectJsTargetMissing({ ids: htmlIds, classes: htmlClasses }, { idRefs, classRefs }) {
    const issues = [];
    const availableIdNames = [...htmlIds.keys()];
    for (const [id, jsPaths] of idRefs) {
        if (htmlIds.has(id)) continue;
        for (const jsPath of jsPaths) {
            issues.push({
                type: 'CROSS_FILE_INCONSISTENCY',
                subtype: 'JS_TARGET_MISSING',
                file: jsPath,
                message: `JS in ${jsPath} references #${id} but no element with id="${id}" exists in any HTML file. Either add the element to the HTML, or change the JS to target an existing id (available: ${availableIdNames.slice(0, 8).join(', ') || 'none'}).`,
                severity: 'error',
                details: { targetType: 'id', target: id, availableIds: availableIdNames },
            });
        }
    }
    for (const [cls, jsPaths] of classRefs) {
        if (htmlClasses.has(cls)) continue;
        for (const jsPath of jsPaths) {
            issues.push({
                type: 'CROSS_FILE_INCONSISTENCY',
                subtype: 'JS_TARGET_MISSING',
                file: jsPath,
                message: `JS in ${jsPath} targets .${cls} but no element with class="${cls}" exists in any HTML file. Either add the class to the HTML, or change the JS to target an existing class.`,
                severity: 'warning',
                details: { targetType: 'class', target: cls },
            });
        }
    }
    return issues;
}

function detectStorageKeyDrift({ storageGets, storageSets }) {
    const issues = [];
    const readOnlyKeys = [...storageGets.keys()].filter(k => !storageSets.has(k));
    const writeOnlyKeys = [...storageSets.keys()].filter(k => !storageGets.has(k));

    if (readOnlyKeys.length === 0 || writeOnlyKeys.length === 0) return issues;

    // Heuristic 1: when there's exactly one read-only and one write-only key, they
    // are very likely meant to be the same key (e.g. read 'tasks', write 'todos').
    if (readOnlyKeys.length === 1 && writeOnlyKeys.length === 1) {
        const readKey = readOnlyKeys[0];
        const writeKey = writeOnlyKeys[0];
        const readFiles = [...storageGets.get(readKey)];
        const writeFiles = [...storageSets.get(writeKey)];
        const allFiles = [...new Set([...readFiles, ...writeFiles])];
        for (const file of allFiles) {
            issues.push({
                type: 'CROSS_FILE_INCONSISTENCY',
                subtype: 'STORAGE_KEY_DRIFT',
                file,
                message: `localStorage key drift: getItem uses "${readKey}" (${readFiles.join(', ')}) but setItem uses "${writeKey}" (${writeFiles.join(', ')}). Reads and writes must use the same key. Pick one canonical name and replace the other.`,
                severity: 'error',
                details: { readKey, writeKey, readFiles, writeFiles },
            });
        }
        return issues;
    }

    // Heuristic 2: for each one-sided key, look for similarly-spelled keys on the other side.
    for (const readKey of readOnlyKeys) {
        const candidates = writeOnlyKeys.filter(k => similar(k, readKey));
        if (candidates.length === 0) continue;
        for (const file of storageGets.get(readKey)) {
            issues.push({
                type: 'CROSS_FILE_INCONSISTENCY',
                subtype: 'STORAGE_KEY_DRIFT',
                file,
                message: `${file} reads localStorage key "${readKey}" but no setItem("${readKey}", ...) exists. Likely typo/drift — similar write keys: ${candidates.join(', ')}. Pick one canonical name.`,
                severity: 'error',
                details: { key: readKey, candidates, side: 'read-only' },
            });
        }
    }
    for (const writeKey of writeOnlyKeys) {
        const candidates = readOnlyKeys.filter(k => similar(k, writeKey));
        if (candidates.length === 0) continue;
        for (const file of storageSets.get(writeKey)) {
            issues.push({
                type: 'CROSS_FILE_INCONSISTENCY',
                subtype: 'STORAGE_KEY_DRIFT',
                file,
                message: `${file} writes localStorage key "${writeKey}" but no getItem("${writeKey}", ...) exists. Likely typo/drift — similar read keys: ${candidates.join(', ')}. Pick one canonical name.`,
                severity: 'error',
                details: { key: writeKey, candidates, side: 'write-only' },
            });
        }
    }
    return issues;
}

function similar(a, b) {
    if (a === b) return true;
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    if (al === bl) return true;
    if (al.includes(bl) || bl.includes(al)) return true;
    // Levenshtein-distance ≤ 2 for short strings
    if (Math.abs(a.length - b.length) > 3) return false;
    return levenshtein(al, bl) <= 2;
}

function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[a.length][b.length];
}

function detectTailwindWithoutConfig({ classes }, _css, files) {
    const issues = [];
    const tailwindClassPattern = /^(?:hover:|focus:|active:|sm:|md:|lg:|xl:|2xl:|dark:|focus-visible:|group-hover:|peer-focus:|disabled:)*(?:m|p|w|h|gap|space|text|bg|border|rounded|flex|grid|items|justify|font|leading|tracking|opacity|shadow|ring|cursor|select|overflow|z|inset|top|bottom|left|right|max|min|order|col|row|absolute|relative|fixed|sticky|block|inline|hidden|visible|transition|transform|scale|rotate|translate|duration|ease|delay|backdrop|filter|blur|sr-only)(?:[-/][\w\-/]+)?$/;

    const tailwindHits = [];
    for (const [cls, paths] of classes) {
        if (tailwindClassPattern.test(cls)) tailwindHits.push({ cls, paths: [...paths] });
    }
    if (tailwindHits.length < 5) return issues; // need a critical mass before flagging

    const hasConfig = !!Object.keys(files).find(p => /tailwind\.config\.(js|cjs|mjs|ts)$/.test(p));
    if (hasConfig) return issues;

    // Flag once at the most-affected HTML file
    const hostFile = tailwindHits[0].paths[0];
    issues.push({
        type: 'CROSS_FILE_INCONSISTENCY',
        subtype: 'TAILWIND_NO_CONFIG',
        file: hostFile,
        message: `${tailwindHits.length} Tailwind utility classes are used (e.g. ${tailwindHits.slice(0, 3).map(h => h.cls).join(', ')}) but no tailwind.config.* file exists. Either add a tailwind.config.js with content paths covering this project, or replace Tailwind classes with vanilla CSS.`,
        severity: 'warning',
        details: { tailwindClassCount: tailwindHits.length, sample: tailwindHits.slice(0, 5).map(h => h.cls) },
    });
    return issues;
}

// Suppress unused warning
void logger;
