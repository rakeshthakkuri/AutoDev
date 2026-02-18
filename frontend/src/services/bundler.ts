// @ts-ignore - Babel standalone doesn't have types
import { transform } from '@babel/standalone';

export type ProjectType = 'react' | 'vue' | 'svelte' | 'nextjs' | 'angular' | 'astro' | 'html' | 'unknown';

export interface BundledProject {
  html: string;
  errors: string[];
  warnings: string[];
  projectType: ProjectType;
}

// Cache for transformed code
const transformCache = new Map<string, string>();

// ─── Detect Project Type ────────────────────────────────────────────────────

export function detectProjectType(files: Record<string, string>): ProjectType {
  const filePaths = Object.keys(files);

  if (filePaths.some(p => p.includes('next.config') || (p.includes('app/') && p.endsWith('.tsx')))) return 'nextjs';
  if (filePaths.some(p => p.endsWith('.vue'))) return 'vue';
  if (filePaths.some(p => p.endsWith('.svelte'))) return 'svelte';
  if (filePaths.some(p => p.endsWith('.astro'))) return 'astro';
  if (filePaths.some(p => p.includes('angular.json') || p.includes('app.component.ts'))) return 'angular';
  if (filePaths.some(p => p.endsWith('.jsx') || p.endsWith('.tsx'))) return 'react';
  if (filePaths.some(p => p.endsWith('.html'))) return 'html';
  return 'unknown';
}

// ─── Detect if project uses Tailwind ────────────────────────────────────────

function usesTailwind(files: Record<string, string>): boolean {
  const filePaths = Object.keys(files);
  // Check for tailwind config or @tailwind directives in CSS
  if (filePaths.some(p => p.includes('tailwind.config'))) return true;
  for (const content of Object.values(files)) {
    if (typeof content === 'string' && content.includes('@tailwind')) return true;
  }
  // Check for utility classes in HTML/JSX
  for (const [path, content] of Object.entries(files)) {
    if (typeof content === 'string' && (path.endsWith('.html') || path.endsWith('.jsx') || path.endsWith('.tsx') || path.endsWith('.vue') || path.endsWith('.svelte') || path.endsWith('.astro'))) {
      // Heuristic: if there are many Tailwind-like classes
      if (/class(?:Name)?="[^"]*(?:flex|grid|p-|m-|text-|bg-|rounded|shadow|border|w-|h-)[^"]*"/.test(content)) {
        return true;
      }
    }
  }
  return false;
}

// ─── Tailwind CDN injection ─────────────────────────────────────────────────

const TAILWIND_CDN = '<script src="https://cdn.tailwindcss.com"></script>';

function injectTailwind(html: string): string {
  if (html.includes('tailwindcss.com')) return html; // already has it
  if (html.includes('</head>')) {
    return html.replace('</head>', `  ${TAILWIND_CDN}\n</head>`);
  }
  return `${TAILWIND_CDN}\n${html}`;
}

// ─── Transform JSX/TSX to JavaScript ────────────────────────────────────────

function transformJSX(code: string, filename: string): { code: string; errors: string[] } {
  const cacheKey = `${filename}:${code}`;
  if (transformCache.has(cacheKey)) {
    return { code: transformCache.get(cacheKey)!, errors: [] };
  }

  try {
    const result = transform(code, {
      presets: ['react'],
      filename,
      sourceType: 'module',
      compact: false,
    });
    if (result.code) {
      transformCache.set(cacheKey, result.code);
      return { code: result.code, errors: [] };
    }
    return { code: '', errors: ['Babel transformation returned no code'] };
  } catch (error: any) {
    return { code: '', errors: [error.message || 'Unknown transformation error'] };
  }
}

// ─── Bundle React Project ───────────────────────────────────────────────────

export function bundleReactProject(files: Record<string, string>): BundledProject {
  const errors: string[] = [];
  const warnings: string[] = [];
  const hasTailwind = usesTailwind(files);

  const jsxFiles = Object.entries(files).filter(([path]) =>
    path.endsWith('.jsx') || path.endsWith('.tsx')
  );

  if (jsxFiles.length === 0) {
    return { html: '', errors: ['No JSX/TSX files found in project'], warnings: [], projectType: 'react' };
  }

  let entryFile = jsxFiles.find(([path]) =>
    path.includes('App.') || path.includes('index.') || path.includes('main.')
  );
  if (!entryFile) {
    entryFile = jsxFiles[0];
    warnings.push('No explicit entry point found, using first JSX file');
  }

  const [entryPath] = entryFile;
  const transformedFiles: Record<string, string> = {};
  const cssFiles: string[] = [];

  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith('.jsx') || path.endsWith('.tsx')) {
      const result = transformJSX(content, path);
      if (result.errors.length > 0) {
        errors.push(`Error transforming ${path}: ${result.errors.join(', ')}`);
      } else {
        transformedFiles[path] = result.code;
      }
    } else if (path.endsWith('.css') || path.endsWith('.scss')) {
      // Skip @tailwind directives for bundled preview
      const cleaned = content.replace(/@tailwind\s+\w+;\s*/g, '');
      if (cleaned.trim()) cssFiles.push(`/* ${path} */\n${cleaned}`);
    }
  }

  if (errors.length > 0 && Object.keys(transformedFiles).length === 0) {
    return { html: '', errors, warnings, projectType: 'react' };
  }

  const cssContent = cssFiles.join('\n\n');
  let appComponentName = 'App';

  const allComponents = Object.entries(transformedFiles)
    .map(([path, code]) => {
      const processedCode = code
        .replace(/import\s+.*?from\s+['"]react['"];?/g, '')
        .replace(/import\s+.*?from\s+['"]react-dom['"];?/g, '')
        .replace(/import\s+.*?from\s+['"][^'"]+['"];?/g, '// Import removed for bundling');

      if (path === entryPath) {
        const defaultExportMatch = processedCode.match(/export\s+default\s+(\w+)/);
        if (defaultExportMatch) appComponentName = defaultExportMatch[1];
        else {
          const funcMatch = processedCode.match(/(?:function|const|var|let)\s+(\w+)\s*[=(]/);
          if (funcMatch) appComponentName = funcMatch[1];
        }
      }
      return `// ${path}\n${processedCode}`;
    })
    .join('\n\n');

  const entryVar = `__Entry_${Date.now()}__`;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React Preview</title>
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
  <script>
    const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, Fragment, useReducer, useLayoutEffect, memo, forwardRef, lazy, Suspense } = React;

    class ErrorBoundary extends React.Component {
      constructor(props) { super(props); this.state = { hasError: false, error: null }; }
      static getDerivedStateFromError(error) { return { hasError: true, error }; }
      componentDidCatch(error, info) { console.error('React Error:', error, info); }
      render() {
        if (this.state.hasError) {
          return React.createElement('div', { style: { padding: '2rem', color: '#ff6b6b', fontFamily: 'monospace', background: '#1a1a1a', minHeight: '100vh', whiteSpace: 'pre-wrap' } },
            React.createElement('h1', { style: { marginBottom: '1rem' } }, 'React Error'),
            React.createElement('pre', null, this.state.error?.toString())
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

    try {
      ${allComponents}

      window.${entryVar} = typeof ${appComponentName} !== 'undefined' ? ${appComponentName} : null;

      const root = ReactDOM.createRoot(document.getElementById('root'));
      const Comp = window.${entryVar};
      if (Comp) {
        root.render(React.createElement(ErrorBoundary, null, React.createElement(Comp, null)));
      } else {
        root.render(React.createElement('div', { style: { padding: '2rem', textAlign: 'center', color: '#666' } }, 'Component not found'));
      }
    } catch (error) {
      document.getElementById('root').innerHTML = '<div style="padding:2rem;color:#ff6b6b;font-family:monospace;background:#1a1a1a;min-height:100vh;white-space:pre-wrap"><h1>Runtime Error</h1><pre>' + error.toString() + '</pre><pre style="margin-top:1rem;font-size:.8rem;color:#888">' + (error.stack||'') + '</pre></div>';
    }
  </script>
</body>
</html>`;

  return { html, errors, warnings, projectType: 'react' };
}

// ─── Bundle Vue Project ─────────────────────────────────────────────────────

export function bundleVueProject(files: Record<string, string>): BundledProject {
  const errors: string[] = [];
  const warnings: string[] = [];
  const hasTailwind = usesTailwind(files);

  // Find Vue SFC files
  const vueFiles = Object.entries(files).filter(([p]) => p.endsWith('.vue'));
  if (vueFiles.length === 0) {
    return { html: '', errors: ['No .vue files found'], warnings: [], projectType: 'vue' };
  }

  // Find App.vue or main entry
  const appFile = vueFiles.find(([p]) => p.includes('App.vue')) || vueFiles[0];
  const [, appContent] = appFile;

  // Extract template, script, style from Vue SFC
  const templateMatch = appContent.match(/<template>([\s\S]*?)<\/template>/);
  const scriptMatch = appContent.match(/<script(?:\s+setup)?>([\s\S]*?)<\/script>/);
  const styleMatch = appContent.match(/<style[^>]*>([\s\S]*?)<\/style>/);

  const template = templateMatch ? templateMatch[1].trim() : '<div>No template found</div>';
  const script = scriptMatch ? scriptMatch[1].trim() : '';
  const style = styleMatch ? styleMatch[1].trim() : '';

  // Collect all CSS from project
  const cssFiles = Object.entries(files)
    .filter(([p]) => p.endsWith('.css') || p.endsWith('.scss'))
    .map(([p, c]) => `/* ${p} */\n${c.replace(/@tailwind\s+\w+;\s*/g, '')}`)
    .join('\n\n');

  // Detect <script setup> syntax
  const isSetup = appContent.includes('<script setup');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vue Preview</title>
  ${hasTailwind ? TAILWIND_CDN : ''}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    ${cssFiles}
    ${style}
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

  return { html, errors, warnings, projectType: 'vue' };
}

// ─── Bundle Svelte Project ──────────────────────────────────────────────────

export function bundleSvelteProject(files: Record<string, string>): BundledProject {
  const warnings: string[] = [];
  const hasTailwind = usesTailwind(files);

  // Find Svelte files
  const svelteFiles = Object.entries(files).filter(([p]) => p.endsWith('.svelte'));
  if (svelteFiles.length === 0) {
    return { html: '', errors: ['No .svelte files found'], warnings: [], projectType: 'svelte' };
  }

  const appFile = svelteFiles.find(([p]) => p.includes('App.svelte')) || svelteFiles[0];
  const [, appContent] = appFile;

  // Extract style from Svelte component
  const styleMatch = appContent.match(/<style[^>]*>([\s\S]*?)<\/style>/);

  // Extract the HTML template (everything not in script/style tags)
  let template = appContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .trim();

  // Convert Svelte template syntax to basic HTML for preview
  template = template
    .replace(/\{#each\s+(\w+)\s+as\s+(\w+)(?:,\s*(\w+))?\}/g, '<!-- each $1 -->')
    .replace(/\{\/each\}/g, '<!-- /each -->')
    .replace(/\{#if\s+[^}]+\}/g, '')
    .replace(/\{:else\s*(?:if\s+[^}]+)?\}/g, '')
    .replace(/\{\/if\}/g, '')
    .replace(/\{([^}]+)\}/g, '<span>$1</span>') // interpolation placeholder
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
  ${hasTailwind ? TAILWIND_CDN : ''}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    ${cssFiles}
    ${style}
  </style>
</head>
<body>
  <div id="app">${template}</div>
</body>
</html>`;

  return { html, errors: [], warnings, projectType: 'svelte' };
}

// ─── Bundle Next.js / Angular / Astro (best-effort preview) ─────────────────

function bundleServerFramework(files: Record<string, string>, type: ProjectType): BundledProject {
  const warnings: string[] = [`${type} requires a local dev server for full functionality. This is a static preview.`];
  const hasTailwind = usesTailwind(files);

  // Try to find the main page content
  let mainContent = '';
  let cssContent = '';

  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith('.css') || path.endsWith('.scss')) {
      cssContent += content.replace(/@tailwind\s+\w+;\s*/g, '') + '\n';
    }
  }

  if (type === 'nextjs') {
    // Find page.tsx content and extract JSX
    const pageFile = Object.entries(files).find(([p]) => p.includes('page.tsx') || p.includes('page.jsx'));
    if (pageFile) {
      // Try to render as React
      const reactFiles: Record<string, string> = {};
      for (const [path, content] of Object.entries(files)) {
        if (path.endsWith('.tsx') || path.endsWith('.jsx')) {
          // Convert Next.js specific imports
          const converted = content
            .replace(/['"]use client['"];?\s*/g, '')
            .replace(/import.*from\s+['"]next\/.*['"];?\s*/g, '')
            .replace(/export\s+const\s+metadata[\s\S]*?;\s*/g, '');
          reactFiles[path] = converted;
        } else {
          reactFiles[path] = content;
        }
      }
      // Rename page.tsx to App.tsx for React bundler
      const pageEntry = Object.entries(reactFiles).find(([p]) => p.includes('page.tsx') || p.includes('page.jsx'));
      if (pageEntry) {
        const [origPath, origContent] = pageEntry;
        delete reactFiles[origPath];
        // Ensure it has a default export named App
        let appContent = origContent;
        if (!appContent.includes('export default')) {
          const funcMatch = appContent.match(/(?:export\s+)?function\s+(\w+)/);
          if (funcMatch) {
            appContent += `\nexport default ${funcMatch[1]};`;
          }
        }
        reactFiles['src/App.tsx'] = appContent;
      }
      const result = bundleReactProject(reactFiles);
      if (result.html) {
        let html = result.html;
        if (hasTailwind && !html.includes('tailwindcss.com')) html = injectTailwind(html);
        return { ...result, html, warnings: [...result.warnings, ...warnings], projectType: 'nextjs' };
      }
    }
  } else if (type === 'angular') {
    // Find component template HTML
    const templateFile = Object.entries(files).find(([p]) => p.includes('.component.html'));
    if (templateFile) {
      mainContent = templateFile[1]
        .replace(/\*ngFor="[^"]*"/g, '')
        .replace(/\*ngIf="[^"]*"/g, '')
        .replace(/\(click\)="[^"]*"/g, '')
        .replace(/\[([^\]]+)\]="[^"]*"/g, '')
        .replace(/\{\{\s*(\w+)\s*\}\}/g, '<span>$1</span>');
    }
  } else if (type === 'astro') {
    // Find .astro page and extract HTML
    const pageFile = Object.entries(files).find(([p]) => p.includes('pages/') && p.endsWith('.astro'));
    if (pageFile) {
      mainContent = pageFile[1]
        .replace(/^---[\s\S]*?---/m, '') // Remove frontmatter
        .replace(/<[A-Z]\w+[^>]*\/>/g, '') // Remove component tags
        .replace(/<[A-Z]\w+[^>]*>[\s\S]*?<\/[A-Z]\w+>/g, '') // Remove component blocks
        .trim();
    }
  }

  if (!mainContent && type !== 'nextjs') {
    // Fallback: just render raw HTML from any HTML-like file
    for (const [path, content] of Object.entries(files)) {
      if (path.endsWith('.html')) { mainContent = content; break; }
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${type} Preview</title>
  ${hasTailwind ? TAILWIND_CDN : ''}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    ${cssContent}
  </style>
</head>
<body>
  ${mainContent || '<div style="padding:2rem;text-align:center;color:#666"><h2>Preview not available</h2><p>Download and run this project locally for full preview.</p></div>'}
</body>
</html>`;

  return { html, errors: [], warnings, projectType: type };
}

// ─── Bundle Plain HTML Project ──────────────────────────────────────────────

export function bundleHTMLProject(files: Record<string, string>): BundledProject {
  const hasTailwind = usesTailwind(files);
  const htmlFile = 'index.html' in files ? 'index.html' : Object.keys(files).find(p => p.endsWith('.html')) || '';
  const cssFiles = Object.entries(files).filter(([p]) => p.endsWith('.css') || p.endsWith('.scss'));
  const jsFiles = Object.entries(files).filter(([p]) => p.endsWith('.js') && !p.endsWith('.jsx'));

  if (!htmlFile) {
    return { html: '', errors: ['No HTML file found'], warnings: [], projectType: 'html' };
  }

  let html = files[htmlFile];

  // Inject CSS
  const cssContent = cssFiles.map(([, c]) => c.replace(/@tailwind\s+\w+;\s*/g, '')).join('\n\n');
  if (cssContent) {
    if (html.includes('</head>')) html = html.replace('</head>', `<style>${cssContent}</style></head>`);
    else html = `<style>${cssContent}</style>\n${html}`;
  }

  // Inject JS
  const jsContent = jsFiles.map(([, c]) => c).join('\n\n');
  if (jsContent) {
    if (html.includes('</body>')) html = html.replace('</body>', `<script>${jsContent}</script></body>`);
    else html += `<script>${jsContent}</script>`;
  }

  // Inject Tailwind if needed
  if (hasTailwind) html = injectTailwind(html);

  return { html, errors: [], warnings: [], projectType: 'html' };
}

// ─── Main Bundler ───────────────────────────────────────────────────────────

export function bundleProject(files: Record<string, string>): BundledProject {
  const projectType = detectProjectType(files);

  switch (projectType) {
    case 'react':
      return bundleReactProject(files);
    case 'vue':
      return bundleVueProject(files);
    case 'svelte':
      return bundleSvelteProject(files);
    case 'nextjs':
    case 'angular':
    case 'astro':
      return bundleServerFramework(files, projectType);
    case 'html':
      return bundleHTMLProject(files);
    default:
      return { html: '', errors: ['Unknown project type'], warnings: [], projectType: 'unknown' };
  }
}

// ─── Resolve Imports (reserved for future) ──────────────────────────────────

export function resolveImports(files: Record<string, string>): Record<string, string> {
  const moduleMap: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    const moduleName = path.replace(/^\//, '').replace(/\.(js|jsx|ts|tsx)$/, '');
    moduleMap[moduleName] = content;
  }
  return moduleMap;
}

// ─── Clear Cache ────────────────────────────────────────────────────────────

export function clearCache(): void {
  transformCache.clear();
}
