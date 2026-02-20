import babel from '@babel/core';
import presetReact from '@babel/preset-react';
import presetTypescript from '@babel/preset-typescript';
import presetEnv from '@babel/preset-env';
import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';

const transformCache = new LRUCache({ max: 100 });

export const PROJECT_TYPES = {
  NEXTJS: 'nextjs',
  VUE: 'vue',
  SVELTE: 'svelte',
  ASTRO: 'astro',
  ANGULAR: 'angular',
  REACT: 'react',
  HTML: 'html',
  UNKNOWN: 'unknown'
};

const TAILWIND_WARN_SUPPRESS =
  '<script>(function(){var w=console.warn;console.warn=function(m){if(typeof m==="string"&&(m.indexOf("cdn.tailwindcss.com")!==-1||m.indexOf("should not be used in production")!==-1))return;return w.apply(this,arguments);};})();</script>';
const TAILWIND_CDN = TAILWIND_WARN_SUPPRESS + '<script src="https://cdn.tailwindcss.com"></script>';

// Injected at the top of every preview <head>.
// Shims browser APIs that throw SecurityError inside a sandboxed srcdoc iframe
// (no allow-same-origin). Each shim is in-memory only — data doesn't persist
// across refreshes, but the app won't crash trying to access them.
const SANDBOX_SHIMS = `<script>
(function() {
  // ── Storage shim ──────────────────────────────────────────────────────────
  function MemStorage() {
    var _s = Object.create(null);
    Object.defineProperties(this, {
      length: { get: function() { return Object.keys(_s).length; }, enumerable: false },
      getItem:     { value: function(k) { return Object.prototype.hasOwnProperty.call(_s, k) ? _s[k] : null; } },
      setItem:     { value: function(k, v) { _s[String(k)] = String(v); } },
      removeItem:  { value: function(k) { delete _s[k]; } },
      clear:       { value: function() { _s = Object.create(null); } },
      key:         { value: function(i) { return Object.keys(_s)[i] || null; } },
    });
  }
  try { void window.localStorage; } catch(e) {
    Object.defineProperty(window, 'localStorage', { value: new MemStorage(), writable: true });
  }
  try { void window.sessionStorage; } catch(e) {
    Object.defineProperty(window, 'sessionStorage', { value: new MemStorage(), writable: true });
  }

  // ── IndexedDB shim (no-op) ─────────────────────────────────────────────────
  if (!window.indexedDB) {
    window.indexedDB = { open: function() {
      var req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(function() { if (req.onerror) req.onerror({ target: req }); }, 0);
      return req;
    }};
  }

  // ── Cookie shim ────────────────────────────────────────────────────────────
  try { void document.cookie; } catch(e) {
    var _cookies = '';
    Object.defineProperty(document, 'cookie', {
      get: function() { return _cookies; },
      set: function(v) { _cookies += ((_cookies ? '; ' : '') + v).split(';')[0]; },
    });
  }

  // ── Notification / geolocation stubs ──────────────────────────────────────
  try {
    if (!window.Notification) window.Notification = { permission: 'denied', requestPermission: function() { return Promise.resolve('denied'); } };
    if (!navigator.geolocation) Object.defineProperty(navigator, 'geolocation', { value: {
      getCurrentPosition: function(_, err) { if (err) err({ code: 1, message: 'Not available in preview' }); },
      watchPosition: function(_, err) { if (err) err({ code: 1, message: 'Not available in preview' }); return 0; },
      clearWatch: function() {},
    }});
  } catch(e) {}
})();
</script>`;

const PLACEHOLDER_DATA_URI =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect fill="%235a67d8" width="600" height="400"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23fff" font-family="sans-serif" font-size="24">Preview</text></svg>'
  );

// ─── CDN Package Registry ─────────────────────────────────────────────────────
// Maps npm package names to a CDN URL + global variable, or an inline shim.
// Used to resolve external package imports in the sandboxed preview environment.
const CDN_PACKAGES = {
  // Inline shims — no CDN latency, no network dependency
  uuid: {
    inline: `window.__pkg_uuid={v4:function(){return(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==='x'?r:r&0x3|0x8).toString(16);});},v1:function(){return Date.now().toString(16)+Math.random().toString(16).slice(2);},v3:function(){return'xxxxxxxx-xxxx-3xxx-xxxx-xxxxxxxxxxxx'.replace(/[x]/g,function(){return(Math.random()*16|0).toString(16);});},v5:function(){return'xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==='x'?r:r&0x3|0x8).toString(16);});}};`,
    global: '__pkg_uuid',
  },
  clsx: {
    inline: `window.__pkg_clsx=(function(){function c(){return Array.prototype.slice.call(arguments).map(function(a){if(!a)return'';if(typeof a==='string'||typeof a==='number')return String(a);if(Array.isArray(a))return c.apply(null,a);if(typeof a==='object')return Object.keys(a).filter(function(k){return!!a[k];}).join(' ');return'';}).filter(Boolean).join(' ');}return c;})();`,
    global: '__pkg_clsx',
  },
  classnames: {
    inline: `window.__pkg_classnames=(function(){function c(){return Array.prototype.slice.call(arguments).map(function(a){if(!a)return'';if(typeof a==='string'||typeof a==='number')return String(a);if(Array.isArray(a))return c.apply(null,a);if(typeof a==='object')return Object.keys(a).filter(function(k){return!!a[k];}).join(' ');return'';}).filter(Boolean).join(' ');}return c;})();`,
    global: '__pkg_classnames',
  },
  // CDN-loaded packages
  lodash:           { url: 'https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js', global: '_' },
  'lodash-es':      { url: 'https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js', global: '_' },
  axios:            { url: 'https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js', global: 'axios' },
  moment:           { url: 'https://cdn.jsdelivr.net/npm/moment@2/moment.min.js', global: 'moment' },
  dayjs:            { url: 'https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js', global: 'dayjs' },
  'date-fns':       { url: 'https://cdn.jsdelivr.net/npm/date-fns@3/cdn.js', global: 'dateFns' },
  'react-router-dom': { url: 'https://cdn.jsdelivr.net/npm/react-router-dom@6/dist/umd/react-router-dom.development.js', global: 'ReactRouterDOM' },
  'react-router':   { url: 'https://cdn.jsdelivr.net/npm/react-router@6/dist/umd/react-router.development.js', global: 'ReactRouter' },
  'chart.js':       { url: 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.js', global: 'Chart' },
  recharts:         { deps: ['https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js'], url: 'https://cdn.jsdelivr.net/npm/recharts@2/umd/Recharts.js', global: 'Recharts' },
  'framer-motion':  { url: 'https://cdn.jsdelivr.net/npm/framer-motion@11/dist/framer-motion.js', global: 'Motion' },
  zod:              { url: 'https://cdn.jsdelivr.net/npm/zod@3/lib/index.umd.js', global: 'Zod' },
  immer:            { url: 'https://cdn.jsdelivr.net/npm/immer@10/dist/immer.umd.production.min.js', global: 'immer' },
  zustand:          { url: 'https://cdn.jsdelivr.net/npm/zustand@4/dist/umd/index.development.js', global: 'zustand' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usesTailwind(files) {
  const filePaths = Object.keys(files);
  if (filePaths.some(p => p.includes('tailwind.config'))) return true;
  for (const content of Object.values(files)) {
    if (typeof content === 'string' && content.includes('@tailwind')) return true;
  }
  for (const [path, content] of Object.entries(files)) {
    if (typeof content === 'string' && (path.endsWith('.html') || path.endsWith('.jsx') || path.endsWith('.tsx') || path.endsWith('.vue') || path.endsWith('.svelte') || path.endsWith('.astro'))) {
      if (/class(?:Name)?="[^"]*(?:flex|grid|p-|m-|text-|bg-|rounded|shadow|border|w-|h-)[^"]*"/.test(content)) {
        return true;
      }
    }
  }
  return false;
}

function injectTailwind(html) {
  if (html.includes('tailwindcss.com')) return html;
  if (html.includes('</head>')) {
    return html.replace('</head>', `  ${TAILWIND_CDN}\n</head>`);
  }
  return `${TAILWIND_CDN}\n${html}`;
}

function transformJSX(code, filename) {
  // Strip invisible characters that trigger spurious "Unexpected token" parse errors
  const sanitized = sanitizeCode(code);

  // Hash sanitized code so cache key is a fixed-size string regardless of file size
  const codeHash = createHash('sha256').update(sanitized).digest('hex').substring(0, 16);
  const cacheKey = `${filename}:${codeHash}`;
  const cached = transformCache.get(cacheKey);
  if (cached) return { code: cached, errors: [] };

  const isTypescript = filename.endsWith('.tsx') || filename.endsWith('.ts');

  function runBabel(src, withTypescript) {
    return babel.transformSync(src, {
      presets: [
        // Use string target format — the legacy { browsers: [...] } key is deprecated
        [presetEnv, { targets: 'last 2 Chrome versions', modules: false }],
        // classic runtime: React must be in scope (provided as CDN global in preview)
        [presetReact, { runtime: 'classic' }],
        withTypescript ? [presetTypescript, { isTSX: true, allExtensions: true }] : null,
      ].filter(Boolean),
      filename,
      sourceType: 'module',
      compact: false,
      configFile: false,
      babelrc: false,
    });
  }

  try {
    const result = runBabel(sanitized, isTypescript);
    if (result.code) {
      transformCache.set(cacheKey, result.code);
      return { code: result.code, errors: [] };
    }
    return { code: '', errors: ['Babel transformation returned no code'] };
  } catch (firstError) {
    // LLMs sometimes emit TypeScript syntax in .jsx files. Retry with the TS preset
    // before giving up — this handles generic annotations, `as` casts, enums, etc.
    if (!isTypescript) {
      try {
        const result = runBabel(sanitized, true /* withTypescript */);
        if (result.code) {
          transformCache.set(cacheKey, result.code);
          return { code: result.code, errors: [] };
        }
      } catch (_) {
        // Second attempt also failed — fall through to original error
      }
    }
    return { code: '', errors: [firstError.message || 'Unknown transformation error'] };
  }
}

function resolveComponentPath(importPath, fromPath, fileKeys) {
  const clean = importPath.replace(/^['"]|['"]\s*;?\s*$/g, '').trim();
  if (clean.startsWith('.') === false) return null;
  const dir = fromPath.includes('/') ? fromPath.replace(/\/[^/]+$/, '') : '';
  const base = dir ? `${dir}/${clean.replace(/^\.\//, '')}` : clean.replace(/^\.\//, '');
  const candidates = [base, base + '.jsx', base + '.tsx', base + '.js', base + '.ts'];
  for (const c of candidates) {
    const exact = fileKeys.find(k => k === c || k.replace(/\/index\.(jsx|tsx|js|ts)$/, '') === c.replace(/\/index$/, ''));
    if (exact) return exact;
    const withExt = fileKeys.find(k => k === c || k.startsWith(c + '.'));
    if (withExt) return withExt;
  }
  return null;
}

function getComponentNameFromCode(code, path) {
  const defaultExportMatch = code.match(/export\s+default\s+(?:function\s+)?(?:class\s+)?(\w+)/);
  if (defaultExportMatch) return defaultExportMatch[1];
  const defaultRefMatch = code.match(/export\s+default\s+(\w+)\s*;?/);
  if (defaultRefMatch) return defaultRefMatch[1];
  const funcMatch = code.match(/(?:function|const|var|let)\s+(\w+)\s*[=(]/);
  if (funcMatch) return funcMatch[1];
  const base = path.replace(/.*\//, '').replace(/\.(jsx|tsx|js|ts)$/, '') || 'Component';
  return base === 'index' ? 'Component' : base;
}

function escapeStyleContent(css) {
  return css.replace(/<\/style>/gi, '\\3C/style>');
}

function escapeScriptContent(js) {
  return js.replace(/<\/script>/gi, '\\u003C/script>');
}

function replacePlaceholderUrls(html) {
  return html.replace(
    /https?:\/\/(?:via\.placeholder|placehold\.co|placeholder\.com)(?:\.[a-z]+)?\/[^\s"']+/gi,
    PLACEHOLDER_DATA_URI
  );
}

// Remove BOM and invisible Unicode characters that cause Babel "Unexpected token" errors
function sanitizeCode(code) {
  return code
    .replace(/^\uFEFF/, '')                         // BOM
    .replace(/[\u200B-\u200D\uFEFF\u2028\u2029]/g, ''); // Zero-width + line/para separators
}

// Scan source files for external package imports (non-relative, non-core)
function detectExternalPackages(files) {
  const needed = new Set();
  // Matches: import X from '…', import { … } from '…', import * as X from '…', import X, { … } from '…'
  const re = /import\s+(?:[\w*{][^'"]*?\s+from\s+)?['"]([^'"./][^'"]*)['"]/g;
  for (const content of Object.values(files)) {
    if (typeof content !== 'string') continue;
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) {
      const root = m[1].split('/')[0]; // 'lodash/debounce' → 'lodash'
      if (root !== 'react' && root !== 'react-dom') needed.add(root);
    }
  }
  return needed;
}

// Build <script> tags (inline shims first, then CDN URLs) for needed packages
function buildCdnScriptTags(neededPackages) {
  const inlineSnippets = [];
  const scriptTags = [];
  for (const pkg of neededPackages) {
    const info = CDN_PACKAGES[pkg];
    if (!info) continue;
    if (info.inline) {
      inlineSnippets.push(info.inline);
    } else {
      if (info.deps) {
        for (const dep of info.deps) scriptTags.push(`  <script src="${dep}" crossorigin></script>`);
      }
      scriptTags.push(`  <script src="${info.url}" crossorigin></script>`);
    }
  }
  const inlineBlock = inlineSnippets.length
    ? `  <script>\n    ${inlineSnippets.join('\n    ')}\n  </script>`
    : '';
  return [inlineBlock, ...scriptTags].filter(Boolean).join('\n');
}

// ─── Topological sort ─────────────────────────────────────────────────────────

// Sort JSX files so every dependency runs before the files that import it.
// This ensures window.__Component_X is populated before any file tries to read it.
function topoSort(fileKeys, codeMap) {
  const visited = new Set();
  const sorted = [];
  const depRe = /import\s+(?:\w+|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;

  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const code = codeMap[key] || '';
    let m;
    depRe.lastIndex = 0;
    while ((m = depRe.exec(code)) !== null) {
      const resolved = resolveComponentPath(m[1], key, fileKeys);
      if (resolved) visit(resolved);
    }
    sorted.push(key);
  }

  for (const k of fileKeys) visit(k);
  return sorted;
}

// ─── Bundlers ────────────────────────────────────────────────────────────────

export function detectProjectType(files) {
  const filePaths = Object.keys(files);
  if (filePaths.some(p => p.includes('next.config') || (p.includes('app/') && p.endsWith('.tsx')))) return PROJECT_TYPES.NEXTJS;
  if (filePaths.some(p => p.endsWith('.vue'))) return PROJECT_TYPES.VUE;
  if (filePaths.some(p => p.endsWith('.svelte'))) return PROJECT_TYPES.SVELTE;
  if (filePaths.some(p => p.endsWith('.astro'))) return PROJECT_TYPES.ASTRO;
  if (filePaths.some(p => p.includes('angular.json') || p.includes('app.component.ts'))) return PROJECT_TYPES.ANGULAR;
  if (filePaths.some(p => p.endsWith('.jsx') || p.endsWith('.tsx'))) return PROJECT_TYPES.REACT;
  if (filePaths.some(p => p.endsWith('.html'))) return PROJECT_TYPES.HTML;
  return PROJECT_TYPES.UNKNOWN;
}

export function bundleReactProject(files) {
  const errors = [];
  const warnings = [];
  const hasTailwind = usesTailwind(files);

  const jsxFiles = Object.entries(files).filter(([path]) =>
    path.endsWith('.jsx') || path.endsWith('.tsx')
  );

  if (jsxFiles.length === 0) {
    return { html: '', errors: ['No JSX/TSX files found in project'], warnings: [], projectType: PROJECT_TYPES.REACT };
  }

  // Prefer main → index → App as the entry file.
  // main/index are true entry points (they call ReactDOM.createRoot); App is a component.
  // Putting the real entry last means all its imported components register first.
  let entryFile =
    jsxFiles.find(([path]) => /(?:^|\/)main\.[jt]sx?$/.test(path)) ||
    jsxFiles.find(([path]) => /(?:^|\/)index\.[jt]sx?$/.test(path)) ||
    jsxFiles.find(([path]) => /(?:^|\/)App\.[jt]sx?$/.test(path)) ||
    jsxFiles[0];
  if (!entryFile) {
    entryFile = jsxFiles[0];
    warnings.push('No explicit entry point found, using first JSX file');
  }

  const [entryPath] = entryFile;

  // Detect external package imports across all source files so we can inject the
  // right CDN scripts before any component code runs.
  const neededPackages = detectExternalPackages(files);
  const extraCdnScripts = buildCdnScriptTags(neededPackages);

  const transformedFiles = {};
  const cssFiles = [];

  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith('.jsx') || path.endsWith('.tsx')) {
      const result = transformJSX(content, path);
      if (result.errors.length > 0) {
        errors.push(`Error transforming ${path}: ${result.errors.join(', ')}`);
      } else {
        transformedFiles[path] = result.code;
      }
    } else if (path.endsWith('.css') || path.endsWith('.scss')) {
      const cleaned = content.replace(/@tailwind\s+\w+;\s*/g, '');
      if (cleaned.trim()) cssFiles.push(`/* ${path} */\n${cleaned}`);
    }
  }

  if (errors.length > 0 && Object.keys(transformedFiles).length === 0) {
    return { html: '', errors, warnings, projectType: PROJECT_TYPES.REACT };
  }

  const fileKeys = Object.keys(transformedFiles);
  const componentNameByPath = {};
  for (const [path, code] of Object.entries(transformedFiles)) {
    componentNameByPath[path] = getComponentNameFromCode(code, path);
  }

  let appComponentName = componentNameByPath[entryPath] ?? 'App';

  // Returns true for anything React can legally use as a JSX element type:
  // plain functions, classes, React.memo results, React.forwardRef results.
  const VALID_REACT_TYPE_CHECK =
    `(typeof __v === 'function' || (__v && typeof __v === 'object' && __v.$$typeof))`;

  // Emit a runtime expression that looks up the component registry and falls back
  // to a visible placeholder — never returns a bare object.
  const safeComponentRef = (alias) =>
    `(function(){ var __v = window.__Component_${alias}; return ${VALID_REACT_TYPE_CHECK} ? __v : function ${alias}(){ return React.createElement('span', { style: { color: '#888', fontSize: '0.75rem', fontFamily: 'monospace' } }, '[${alias}]'); }; })()`;

  const processFileCode = (path, code) => {
    let processedCode = code;

    // ── Pre-scan: capture all named exports BEFORE stripping them ─────────────
    // We register every exported symbol in the component registry so that
    // `import { Button, Input } from './components/ui'` works even when the
    // file uses only named exports (no default export).
    const namedExportRe = /\bexport\s+(?:const\s+|let\s+|var\s+|function\*?\s+|class\s+)(\w+)/g;
    const allNamedExports = new Set();
    for (const m of processedCode.matchAll(namedExportRe)) {
      if (m[1]) allNamedExports.add(m[1]);
    }

    // ── Step 0: Asset imports → empty object stubs ───────────────────────────
    // CSS modules, SVG, image, font imports are not resolvable in preview;
    // give them an empty object so code like `styles.container` doesn't crash.
    processedCode = processedCode.replace(
      /import\s+(\w+)\s+from\s+['"][^'"]+\.(?:css|scss|less|sass|svg|png|jpg|jpeg|gif|webp|avif|woff2?|ttf|eot|ico)(?:\?[^'"]*)?['"]\s*;?/g,
      (_, ident) => `const ${ident} = {}; // asset import (not available in preview)\n`
    );

    // ── Step 1: Default imports ────────────────────────────────────────────────
    // Handles: import Foo from 'module'
    processedCode = processedCode.replace(
      /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?/g,
      (_, ident, importPath) => {
        const rawPath = (importPath || '').replace(/^['"]|['"]\s*;?\s*$/g, '').trim();
        // React/ReactDOM — available as CDN globals
        if (rawPath === 'react' || rawPath === 'react-dom' || rawPath.startsWith('react-dom/')) {
          return '/* ' + ident + ' from CDN */';
        }
        // Local component file (default import) — guard with typeof check so
        // an object default export never silently becomes a React element type
        const resolved = resolveComponentPath(importPath, path, fileKeys);
        if (resolved) {
          const targetName = componentNameByPath[resolved] ?? ident;
          return `const ${ident} = ${safeComponentRef(targetName)};`;
        }
        // Local path that didn't resolve (file missing from bundle) — must return a
        // function, never an object, or React will throw "Element type is invalid: got object"
        if (rawPath.startsWith('.') || rawPath.startsWith('/')) {
          return `const ${ident} = ${safeComponentRef(ident)};`;
        }
        // External npm package (default import)
        const rootPkg = rawPath.split('/')[0];
        const cdnInfo = CDN_PACKAGES[rootPkg];
        if (cdnInfo) {
          // CDN global when loaded (may be object or function — valid either way).
          // Stub is a no-op function so <Pkg /> doesn't crash if CDN fails.
          return `const ${ident} = (typeof ${cdnInfo.global} !== 'undefined') ? ${cdnInfo.global} : function ${ident}(){ console.warn('[preview] CDN failed for "${rawPath}"'); return null; };`;
        }
        // Unknown external package — function stub so it can be used as JSX without crashing
        return `function ${ident}(){ console.warn('[preview] "${rawPath}" is not available in preview'); return null; } /* ${rawPath} */`;
      }
    );

    // ── Step 1b: Named imports from LOCAL files ───────────────────────────────
    // Handles: import { Button, Input } from './components/ui'
    // Each named export is independently registered in the component registry,
    // so we can look each one up by name.
    processedCode = processedCode.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"](\.[^'"]*)['"]\s*;?/g,
      (_, namedImports) => {
        const imports = namedImports
          .split(',')
          .map(s => {
            const parts = s.trim().split(/\s+as\s+/);
            return { original: parts[0].trim(), alias: (parts[1] || parts[0]).trim() };
          })
          .filter(i => i.original && i.alias);
        return imports
          .map(({ original, alias }) => `const ${alias} = ${safeComponentRef(original)};`)
          .join('\n');
      }
    );

    // ── Step 2: Named imports from external packages ───────────────────────────
    // Handles: import { v4 as uuidv4, v1 } from 'uuid'
    // Only matches paths that don't start with . or / (i.e. npm packages)
    processedCode = processedCode.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]([^'"./][^'"]*)['"]\s*;?/g,
      (_, namedImports, pkg) => {
        const rootPkg = pkg.split('/')[0];
        // React/ReactDOM named imports are already destructured at the top of the script
        if (rootPkg === 'react' || rootPkg === 'react-dom') {
          return '// React/ReactDOM named imports available as globals\n';
        }
        const imports = namedImports
          .split(',')
          .map(s => {
            const parts = s.trim().split(/\s+as\s+/);
            return { original: parts[0].trim(), alias: (parts[1] || parts[0]).trim() };
          })
          .filter(i => i.original && i.alias);

        const cdnInfo = CDN_PACKAGES[rootPkg];
        if (cdnInfo) {
          return imports
            .map(({ original, alias }) =>
              `const ${alias} = (typeof ${cdnInfo.global} !== 'undefined' && ${cdnInfo.global} != null && ${cdnInfo.global}['${original}'] !== undefined) ? ${cdnInfo.global}['${original}'] : function ${alias}() { console.warn('[preview] ${pkg}.${original} not available'); return undefined; };`
            )
            .join('\n');
        }
        // Unknown package — warning stubs so the file runs without crashing
        return imports
          .map(({ alias }) =>
            `function ${alias}() { console.warn('[preview] Package "${pkg}" (${alias}) is not available in preview mode'); return undefined; }`
          )
          .join('\n');
      }
    );

    // ── Step 3: Namespace imports from external packages ──────────────────────
    // Handles: import * as uuid from 'uuid'  /  import * as Icons from 'lucide-react'
    processedCode = processedCode.replace(
      /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"./][^'"]*)['"]\s*;?/g,
      (_, alias, pkg) => {
        const rootPkg = pkg.split('/')[0];
        const cdnInfo = CDN_PACKAGES[rootPkg];
        if (cdnInfo) {
          return `const ${alias} = (typeof ${cdnInfo.global} !== 'undefined') ? ${cdnInfo.global} : {};`;
        }
        return `const ${alias} = {}; /* Package "${pkg}" not available in preview */`;
      }
    );

    // ── Step 4: Combined default + named imports from external packages ────────
    // Handles: import React, { useState } from 'react'  /  import axios, { isAxiosError } from 'axios'
    processedCode = processedCode.replace(
      /import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"]([^'"./][^'"]*)['"]\s*;?/g,
      (_, defaultIdent, namedImports, pkg) => {
        const rootPkg = pkg.split('/')[0];
        if (rootPkg === 'react' || rootPkg === 'react-dom') {
          return '// React/ReactDOM combined import — available as globals\n';
        }
        const imports = namedImports
          .split(',')
          .map(s => {
            const parts = s.trim().split(/\s+as\s+/);
            return { original: parts[0].trim(), alias: (parts[1] || parts[0]).trim() };
          })
          .filter(i => i.original && i.alias);

        const cdnInfo = CDN_PACKAGES[rootPkg];
        const defaultLine = cdnInfo
          ? `const ${defaultIdent} = (typeof ${cdnInfo.global} !== 'undefined') ? ${cdnInfo.global} : function ${defaultIdent}(){ return null; };`
          : `function ${defaultIdent}(){ console.warn('[preview] "${pkg}" not available'); return null; }`;
        const namedLines = imports
          .map(({ original, alias }) =>
            cdnInfo
              ? `const ${alias} = (typeof ${cdnInfo.global} !== 'undefined' && ${cdnInfo.global}['${original}'] !== undefined) ? ${cdnInfo.global}['${original}'] : function ${alias}() { return undefined; };`
              : `function ${alias}() { console.warn('[preview] Package "${pkg}" (${alias}) not available'); return undefined; }`
          )
          .join('\n');
        return [defaultLine, namedLines].filter(Boolean).join('\n');
      }
    );

    // ── Step 5: Remove any remaining import statements ────────────────────────
    processedCode = processedCode
      .replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?\s*/g, '// Import removed\n')
      .replace(/import\s+['"][^'"]+['"];?\s*/g, '// Import removed\n')
      // Babel sometimes emits `var _react = _interopRequireDefault(require("react"))` — strip it
      .replace(/var\s+_react\s*=\s*[^;]+;/g, '// _react = React (from CDN)\n')
      .replace(/var\s+_reactDom\s*=\s*[^;]+;/g, '// _reactDom = ReactDOM (from CDN)\n')
      .replace(/_react\d*\.default\b/g, 'React')
      .replace(/_reactDom\d*\.default\b/g, 'ReactDOM')
      .replace(/function\s+_interopRequireDefault[^{]*\{[^}]*\}/g, '')
      .replace(/function\s+_interopRequireWildcard[^}]+\}[\s\S]*?\}/g, '');

    // ── Step 6: Strip exports ─────────────────────────────────────────────────
    processedCode = processedCode
      .replace(/export\s+default\s+function\s+/g, 'function ')
      .replace(/export\s+default\s+class\s+/g, 'class ')
      // `export default { A, B }` — exporting a plain object as the module default
      // is one of the most common LLM mistakes. Strip the statement entirely;
      // the symbols A and B are already declared in scope and will be registered below.
      .replace(/export\s+default\s+\{[^}]*\}\s*;?/g, '// export default object removed\n')
      .replace(/export\s+default\s+(\w+)\s*;?/g, '// default export: $1')
      .replace(/export\s+(?:const|let|var|function\*?|class)\s+/g, (m) => m.replace('export ', ''))
      // Barrel re-exports: export * from / export * as X from
      .replace(/export\s+\*\s+(?:as\s+\w+\s+)?from\s+['"][^'"]+['"];?\s*/g, '// re-export removed\n')
      .replace(/export\s*\{[^}]*\}\s*(?:from\s+['"][^'"]+['"])?\s*;?/g, '// named export removed\n');

    // ── Step 7: Register components ───────────────────────────────────────────
    // Register the file's main component AND every named export so that both
    // `import Foo from './Foo'` and `import { Foo } from './Foo'` resolve correctly.
    const componentName = componentNameByPath[path];
    const allSymbols = new Set([componentName, ...allNamedExports]);
    const registerLines = [...allSymbols]
      .filter(Boolean)
      .map(name =>
        // Only register functions and React special types (memo, forwardRef, lazy).
        // Registering plain objects would poison the registry and cause "got: object" crashes.
        `(function(){ var __v = ${name}; if (__v != null && (typeof __v === 'function' || (typeof __v === 'object' && __v.$$typeof))) { window.__Component_${name} = __v; } })()`
      )
      .join('\n  ');

    // Wrap in IIFE: each file gets its own scope so declarations from different
    // files never collide in the shared <script> block.
    return `// ${path}\n(function() {\n${processedCode}\n  ${registerLines}\n})();`;
  };

  // Topological sort: dependencies execute before the files that import them.
  // topoSort already places the entry file last (everything imports it transitively or it has no dependents).
  const orderedPaths = topoSort(fileKeys, transformedFiles);
  const allComponents = orderedPaths
    .map(path => processFileCode(path, transformedFiles[path]))
    .join('\n\n');

  const cssContent = cssFiles.join('\n\n');
  const entryVar = `__Entry_${Date.now()}__`;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React Preview</title>
  ${SANDBOX_SHIMS}
  ${hasTailwind ? TAILWIND_CDN : ''}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    ${cssContent}
  </style>
</head>
<body>
  <div id="root"></div>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
${extraCdnScripts}
  <script>
    var module = { exports: {} };
    var exports = module.exports;
    // React hooks and APIs — available as globals so named imports work after stripping
    const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, Fragment, useReducer, useLayoutEffect, useId, useTransition, useDeferredValue, memo, forwardRef, lazy, Suspense, StrictMode } = React;
    // ReactDOM APIs — covers both 'react-dom' and 'react-dom/client' named imports
    const { createRoot, hydrateRoot, flushSync } = ReactDOM;

    function SafeComponent(Comp, props, fallback) {
      var valid = Comp != null && (typeof Comp === 'function' || (typeof Comp === 'object' && Comp.$$typeof));
      if (!valid) return React.createElement('div', { style: { padding: '1rem', color: '#888', fontFamily: 'monospace' } }, fallback || '[Component not found]');
      return React.createElement(Comp, props || null);
    }

    class ErrorBoundary extends React.Component {
      constructor(props) { super(props); this.state = { hasError: false, error: null }; }
      static getDerivedStateFromError(error) { return { hasError: true, error }; }
      componentDidCatch(error, info) { console.error('React Error:', error, info); }
      render() {
        if (this.state.hasError) {
          var msg = this.state.error && this.state.error.toString ? this.state.error.toString() : '';
          var isMissing = /not a function|undefined|null|Component not found/i.test(msg);
          return React.createElement('div', { style: { padding: '2rem', color: isMissing ? '#888' : '#ff6b6b', fontFamily: 'monospace', background: '#1a1a1a', minHeight: '100vh', whiteSpace: 'pre-wrap' } },
            React.createElement('h1', { style: { marginBottom: '1rem' } }, isMissing ? 'Component not found' : 'React Error'),
            React.createElement('pre', null, msg)
          );
        }
        return this.props.children;
      }
    }

    window.require = function(p) {
      if (p === 'react' || p.includes('react')) return React;
      if (p === 'react-dom' || p.includes('react-dom')) return ReactDOM;
      return {};
    };

    // Intercept ReactDOM.createRoot so we know whether the generated entry file
    // mounts the app itself.  If it does, we skip our fallback mount to avoid the
    // "createRoot on a container already used" warning and double-render.
    var __previewMounted = false;
    var __origCreateRoot = ReactDOM.createRoot;
    ReactDOM.createRoot = function(container) {
      var _r = __origCreateRoot.call(ReactDOM, container);
      var _origRender = _r.render.bind(_r);
      _r.render = function() { __previewMounted = true; return _origRender.apply(this, arguments); };
      return _r;
    };

    try {
      ${allComponents}

      ReactDOM.createRoot = __origCreateRoot; // restore original

      if (!__previewMounted) {
        // The generated code is a component-only file (no ReactDOM.createRoot call).
        // Mount it ourselves using the global component registry.
        // Guard: typeof check prevents "Element type is invalid...got: object" when the
        // LLM accidentally exports a plain object instead of a component function.
        var _rootRaw = window.__Component_${appComponentName};
        var _rootComp = (_rootRaw != null && (typeof _rootRaw === 'function' || (typeof _rootRaw === 'object' && _rootRaw.$$typeof))) ? _rootRaw : null;
        var _root = ReactDOM.createRoot(document.getElementById('root'));
        if (_rootComp) {
          _root.render(React.createElement(ErrorBoundary, null, React.createElement(_rootComp, null)));
        } else if (_rootRaw != null) {
          // Something was exported but it's not a function — show a useful message
          _root.render(React.createElement('div', { style: { padding: '2rem', color: '#ff6b6b', fontFamily: 'monospace', background: '#1a1a1a', minHeight: '100vh' } },
            React.createElement('h1', { style: { marginBottom: '1rem' } }, 'Invalid Component'),
            React.createElement('pre', null, '"${appComponentName}" is not a function (got: ' + typeof _rootRaw + '). Use: export default function ${appComponentName}() { ... }')
          ));
        } else {
          _root.render(React.createElement('div', { style: { padding: '2rem', textAlign: 'center', color: '#666' } }, 'Component not found'));
        }
      }
    } catch (error) {
      ReactDOM.createRoot = __origCreateRoot;
      document.getElementById('root').innerHTML = '<div style="padding:2rem;color:#ff6b6b;font-family:monospace;background:#1a1a1a;min-height:100vh;white-space:pre-wrap"><h1>Runtime Error</h1><pre>' + error.toString() + '</pre><pre style="margin-top:1rem;font-size:.8rem;color:#888">' + (error.stack||'') + '</pre></div>';
    }
  </script>
</body>
</html>`;

  return { html: replacePlaceholderUrls(html), errors, warnings, projectType: PROJECT_TYPES.REACT };
}

export function bundleVueProject(files) {
  const errors = [];
  const warnings = [];
  const hasTailwind = usesTailwind(files);

  const vueFiles = Object.entries(files).filter(([p]) => p.endsWith('.vue'));
  if (vueFiles.length === 0) {
    return { html: '', errors: ['No .vue files found'], warnings: [], projectType: PROJECT_TYPES.VUE };
  }

  const appFile = vueFiles.find(([p]) => p.includes('App.vue')) || vueFiles[0];
  const [, appContent] = appFile;

  const templateMatch = appContent.match(/<template>([\s\S]*?)<\/template>/);
  const scriptMatch = appContent.match(/<script(?:\s+setup)?>([\s\S]*?)<\/script>/);
  const styleMatch = appContent.match(/<style[^>]*>([\s\S]*?)<\/style>/);

  const template = templateMatch ? templateMatch[1].trim() : '<div>No template found</div>';
  const script = scriptMatch ? scriptMatch[1].trim() : '';
  const style = styleMatch ? styleMatch[1].trim() : '';

  const cssFiles = Object.entries(files)
    .filter(([p]) => p.endsWith('.css') || p.endsWith('.scss'))
    .map(([p, c]) => `/* ${p} */\n${c.replace(/@tailwind\s+\w+;\s*/g, '')}`)
    .join('\n\n');

  const isSetup = appContent.includes('<script setup');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vue Preview</title>
  ${SANDBOX_SHIMS}
  ${hasTailwind ? TAILWIND_CDN : ''}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    ${cssFiles}
    ${escapeStyleContent(style)}
  </style>
</head>
<body>
  <div id="app">${template}</div>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script>
    try {
      const { createApp, ref, reactive, computed, watch, onMounted, onUnmounted } = Vue;

      const app = createApp({
        setup() {
          ${isSetup ? script
            .replace(/import\s+.*?from\s+['"][^'"]+['"];?\s*/g, '')
            .replace(/defineProps\([^)]*\)/g, '{}')
            .replace(/defineEmits\([^)]*\)/g, '(() => {})')
            : `return {};`
          }
        }
      });

      app.mount('#app');
    } catch (error) {
      document.getElementById('app').innerHTML = '<div style="padding:2rem;color:#ff6b6b;font-family:monospace;background:#1a1a1a;min-height:100vh;white-space:pre-wrap"><h1>Vue Error</h1><pre>' + error.toString() + '</pre></div>';
      console.error('Vue error:', error);
    }
  </script>
</body>
</html>`;

  return { html: replacePlaceholderUrls(html), errors, warnings, projectType: PROJECT_TYPES.VUE };
}

export function bundleSvelteProject(files) {
  const warnings = [];
  const hasTailwind = usesTailwind(files);

  const svelteFiles = Object.entries(files).filter(([p]) => p.endsWith('.svelte'));
  if (svelteFiles.length === 0) {
    return { html: '', errors: ['No .svelte files found'], warnings: [], projectType: PROJECT_TYPES.SVELTE };
  }

  const appFile = svelteFiles.find(([p]) => p.includes('App.svelte')) || svelteFiles[0];
  const [, appContent] = appFile;

  const styleMatch = appContent.match(/<style[^>]*>([\s\S]*?)<\/style>/);

  let template = appContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .trim();

  template = template
    .replace(/\{#each\s+(\w+)\s+as\s+(\w+)(?:,\s*(\w+))?\}/g, '<!-- each $1 -->')
    .replace(/\{\/each\}/g, '<!-- /each -->')
    .replace(/\{#if\s+[^}]+\}/g, '')
    .replace(/\{\:else\s*(?:if\s+[^}]+)?\}/g, '')
    .replace(/\{\/if\}/g, '')
    .replace(/\{([^}]+)\}/g, '<span>$1</span>')
    .replace(/on:click=\{[^}]+\}/g, '')
    .replace(/bind:\w+(?:=\{[^}]+\})?/g, '')
    .replace(/class:(\w+)(?:=\{[^}]+\})?/g, 'class="$1"');

  const style = styleMatch ? styleMatch[1].trim() : '';
  const cssFiles = Object.entries(files)
    .filter(([p]) => p.endsWith('.css'))
    .map(([p, c]) => `/* ${p} */\n${c.replace(/@tailwind\s+\w+;\s*/g, '')}`)
    .join('\n\n');

  warnings.push('Svelte preview is a static render — interactive features require running locally');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Svelte Preview</title>
  ${SANDBOX_SHIMS}
  ${hasTailwind ? TAILWIND_CDN : ''}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    ${cssFiles}
    ${escapeStyleContent(style)}
  </style>
</head>
<body>
  <div id="app">${template}</div>
</body>
</html>`;

  return { html: replacePlaceholderUrls(html), errors: [], warnings, projectType: PROJECT_TYPES.SVELTE };
}

export function bundleHTMLProject(files) {
  const hasTailwind = usesTailwind(files);
  const fileKeys = Object.keys(files);

  const htmlFile =
    fileKeys.find((p) => p === 'index.html') ||
    fileKeys.find((p) => p.toLowerCase() === 'index.html') ||
    fileKeys.find((p) => p.toLowerCase().endsWith('/index.html')) ||
    fileKeys.find((p) => p.toLowerCase().endsWith('.html')) ||
    '';

  if (!htmlFile || typeof files[htmlFile] !== 'string') {
    return { html: '', errors: ['No HTML file found'], warnings: [], projectType: PROJECT_TYPES.HTML };
  }

  const cssFiles = Object.entries(files).filter(
    ([p, c]) => (p.endsWith('.css') || p.endsWith('.scss')) && typeof c === 'string' && c.trim().length > 0
  );
  const configPattern = /(?:vite|rollup|webpack|tailwind|postcss|babel|jest|eslint)\.config\.(?:js|ts|mjs|cjs)$/i;
  const jsFiles = Object.entries(files).filter(
    ([p, c]) =>
      p.endsWith('.js') &&
      !p.endsWith('.jsx') &&
      !configPattern.test(p) &&
      typeof c === 'string' &&
      c.trim().length > 0
  );

  let html = files[htmlFile];

  // Strip external script tags so srcdoc iframe doesn't request parent-origin URLs (CORS/404).
  html = html.replace(/<script[^>]*\ssrc\s*=\s*["'][^"']*["'][^>]*>\s*<\/script>/gi, '<!-- external script removed for preview -->');
  // Strip inline scripts that are build/config (defineConfig, etc.) so they don't run in preview.
  // In kept scripts, avoid duplicate React (use __react so global React is used).
  html = html.replace(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi, (_, body) => {
    if (/defineConfig|vite\.config|rollup\.config|webpack\.config/i.test(body)) return '<!-- config script removed for preview -->';
    const safe = body.replace(/\b(?:const|let|var)\s+React\s*=/g, 'var __react =');
    return `<script>${safe}</script>`;
  });

  // Inline CSS
  let styleTags = '';
  for (const [path, content] of cssFiles) {
    const cleaned = content.replace(/@tailwind\s+\w+;\s*/g, '');
    styleTags += `\n<style data-filename="${path}">\n${escapeStyleContent(cleaned)}\n</style>`;
  }

  const moduleShim = 'var module = typeof module !== "undefined" ? module : { exports: {} }; var exports = module.exports; ';
  // Inline JS (strip imports/exports so script runs in srcdoc without module context)
  let scriptTags = '';
  for (const [path, content] of jsFiles) {
    let cleaned = content
      .replace(/\bimport\s+.*?from\s+['"][^'"]+['"];?\s*/g, '')
      .replace(/\bexport\s+default\s+/g, '/* export default */ ')
      .replace(/\bexport\s*\{[^}]*\}\s*;?\s*/g, '')
      .replace(/\bexport\s+(?:const|let|var|function|class)\s+/g, (m) => m.replace('export ', ''))
      .replace(/\bdefineConfig\s*\(/g, '/* defineConfig */ (') // Vite/config – prevent ReferenceError
      .replace(/\b(?:const|let|var)\s+React\s*=/g, '/* React from CDN */ var __react =');
    scriptTags += `\n<script data-filename="${path}">\n${escapeScriptContent(moduleShim + cleaned)}\n</script>`;
  }

  if (html.includes('</head>')) {
    html = html.replace('</head>', `${SANDBOX_SHIMS}\n${styleTags}\n</head>`);
  } else if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>\n${SANDBOX_SHIMS}`);
  } else {
    html = `${SANDBOX_SHIMS}\n${styleTags}\n${html}`;
  }

  if (html.includes('</body>')) {
    html = html.replace('</body>', `${scriptTags}\n</body>`);
  } else {
    html = `${html}\n${scriptTags}`;
  }

  if (hasTailwind) {
    html = injectTailwind(html);
  }

  return { html: replacePlaceholderUrls(html), errors: [], warnings: [], projectType: PROJECT_TYPES.HTML };
}

function buildServerFrameworkFallback(files, type) {
  const fileList = Object.keys(files).sort();
  const groups = [
    { label: 'Pages / components', paths: fileList.filter(p => /\.(tsx?|jsx?|vue|svelte|astro|html)$/.test(p)) },
    { label: 'Styles', paths: fileList.filter(p => p.endsWith('.css') || p.endsWith('.scss')) },
    { label: 'Config / other', paths: fileList.filter(p => !/\.(tsx?|jsx?|vue|svelte|astro|html|css|scss)$/.test(p)) },
  ].filter(g => g.paths.length > 0);

  const sections = groups
    .map(g => `<p style="font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;color:#71717a;margin:.75rem 0 .25rem">${g.label}</p><ul style="list-style:none;font-size:.875rem;font-family:ui-monospace,monospace">${g.paths.map(p => `<li style="padding:.2rem 0;color:#d4d4d8">${p}</li>`).join('')}</ul>`)
    .join('');

  return `
<div style="min-height:100vh;background:linear-gradient(180deg,#0f0f12 0%,#1a1a22 100%);color:#e4e4e7;font-family:system-ui,-apple-system,sans-serif;padding:2rem;box-sizing:border-box">
  <div style="max-width:640px;margin:0 auto">
    <h1 style="font-size:1.5rem;font-weight:600;margin-bottom:0.5rem">${type} project</h1>
    <p style="color:#a1a1aa;margin-bottom:1.5rem">This preview could not run the full app. Download the project and run it locally for the full experience.</p>
    <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:1rem;margin-bottom:1rem">
      ${sections}
    </div>
    <p style="font-size:.875rem;color:#71717a">Run locally: <code style="background:rgba(255,255,255,.1);padding:.2em .4em;border-radius:4px">npm install && npm run dev</code></p>
  </div>
</div>`;
}

export function bundleServerFramework(files, type) {
  const warnings = [`Run locally for full ${type} support.`];
  const hasTailwind = usesTailwind(files);

  if (type === PROJECT_TYPES.NEXTJS) {
    const isApiRoute = (p) => /(?:^|\/)(?:app|pages)\/api\//.test(p) || /\/route\.(ts|tsx|js|jsx)$/.test(p);
    const pageFile = Object.entries(files).find(([p]) => !isApiRoute(p) && (p.includes('page.tsx') || p.includes('page.jsx')));
    if (pageFile) {
      const reactFiles = {};
      for (const [path, content] of Object.entries(files)) {
        if (isApiRoute(path)) continue;
        if (path.endsWith('.tsx') || path.endsWith('.jsx')) {
          const converted = content
            .replace(/['"]use client['"];?\s*/g, '')
            .replace(/import.*from\s+['"]next\/.*['"];?\s*/g, '')
            .replace(/export\s+const\s+metadata[\s\S]*?;\s*/g, '');
          reactFiles[path] = converted;
        } else {
          reactFiles[path] = content;
        }
      }
      const pageEntry = Object.entries(reactFiles).find(([p]) => p.includes('page.tsx') || p.includes('page.jsx'));
      if (pageEntry) {
        const [origPath, origContent] = pageEntry;
        delete reactFiles[origPath];
        let appContent = origContent;
        if (!appContent.includes('export default')) {
          const funcMatch = appContent.match(/(?:export\s+)?function\s+(\w+)/);
          if (funcMatch) appContent += `\nexport default ${funcMatch[1]};`;
        }
        reactFiles['src/App.tsx'] = appContent;
      }
      const result = bundleReactProject(reactFiles);
      if (result.html) {
        let html = result.html;
        if (hasTailwind && !html.includes('tailwindcss.com')) html = injectTailwind(html);
        return { ...result, html, warnings: [...result.warnings, ...warnings], projectType: PROJECT_TYPES.NEXTJS };
      }
    }
  }

  const bodyContent = buildServerFrameworkFallback(files, type);
  let cssContent = '';
  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith('.css') || path.endsWith('.scss')) {
      cssContent += `/* ${path} */\n` + content.replace(/@tailwind\s+\w+;\s*/g, '') + '\n';
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${type} Preview</title>
  ${SANDBOX_SHIMS}
  ${hasTailwind ? TAILWIND_CDN : ''}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    ${cssContent}
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;

  return { html: replacePlaceholderUrls(html), errors: [], warnings, projectType: type };
}

export function bundleProject(files) {
  const type = detectProjectType(files);
  switch (type) {
    case PROJECT_TYPES.REACT: return bundleReactProject(files);
    case PROJECT_TYPES.VUE: return bundleVueProject(files);
    case PROJECT_TYPES.SVELTE: return bundleSvelteProject(files);
    case PROJECT_TYPES.HTML: return bundleHTMLProject(files);
    case PROJECT_TYPES.NEXTJS:
    case PROJECT_TYPES.ANGULAR:
    case PROJECT_TYPES.ASTRO:
      return bundleServerFramework(files, type);
    default:
      return {
        html: buildServerFrameworkFallback(files, type),
        errors: [],
        warnings: ['Unknown project type. Showing static file list.'],
        projectType: type
      };
  }
}
