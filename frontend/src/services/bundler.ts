// @ts-ignore - Babel standalone doesn't have types
import { transform } from '@babel/standalone';

export type ProjectType = 'react' | 'vue' | 'svelte' | 'html' | 'unknown';

export interface BundledProject {
  html: string;
  errors: string[];
  warnings: string[];
  projectType: ProjectType;
}

// Cache for transformed code
const transformCache = new Map<string, string>();

/**
 * Detect project type based on files
 */
export function detectProjectType(files: Record<string, string>): ProjectType {
  const filePaths = Object.keys(files);
  
  // Check for React
  if (filePaths.some(path => path.endsWith('.jsx') || path.endsWith('.tsx'))) {
    return 'react';
  }
  
  // Check for Vue
  if (filePaths.some(path => path.endsWith('.vue'))) {
    return 'vue';
  }
  
  // Check for Svelte
  if (filePaths.some(path => path.endsWith('.svelte'))) {
    return 'svelte';
  }
  
  // Check for HTML
  if (filePaths.some(path => path.endsWith('.html'))) {
    return 'html';
  }
  
  return 'unknown';
}

/**
 * Transform JSX/TSX to JavaScript using Babel
 */
function transformJSX(code: string, filename: string): { code: string; errors: string[] } {
  const cacheKey = `${filename}:${code}`;
  
  // Check cache
  if (transformCache.has(cacheKey)) {
    return { code: transformCache.get(cacheKey)!, errors: [] };
  }
  
  try {
    const result = transform(code, {
      presets: ['react'],
      filename: filename,
      sourceType: 'module',
      compact: false,
    });
    
    if (result.code) {
      transformCache.set(cacheKey, result.code);
      return { code: result.code, errors: [] };
    } else {
      return { code: '', errors: ['Babel transformation returned no code'] };
    }
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown transformation error';
    return { code: '', errors: [errorMsg] };
  }
}

/**
 * Resolve imports and create module map
 */
function resolveImports(files: Record<string, string>): Record<string, string> {
  const moduleMap: Record<string, string> = {};
  
  for (const [path, content] of Object.entries(files)) {
    // Normalize path (remove leading slash, convert to module name)
    const moduleName = path.replace(/^\//, '').replace(/\.(js|jsx|ts|tsx)$/, '');
    moduleMap[moduleName] = content;
  }
  
  return moduleMap;
}

/**
 * Bundle React project
 */
export function bundleReactProject(files: Record<string, string>): BundledProject {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Find main entry point (App.jsx, index.jsx, main.jsx, or first .jsx file)
  const jsxFiles = Object.entries(files).filter(([path]) => 
    path.endsWith('.jsx') || path.endsWith('.tsx')
  );
  
  if (jsxFiles.length === 0) {
    return {
      html: '',
      errors: ['No JSX/TSX files found in project'],
      warnings: [],
      projectType: 'react'
    };
  }
  
  // Find entry point
  let entryFile = jsxFiles.find(([path]) => 
    path.includes('App.') || path.includes('index.') || path.includes('main.')
  );
  
  if (!entryFile) {
    entryFile = jsxFiles[0];
    warnings.push('No explicit entry point found, using first JSX file');
  }
  
  const [entryPath, entryContent] = entryFile;
  
  // Transform all JSX files
  const transformedFiles: Record<string, string> = {};
  const cssFiles: string[] = [];
  const htmlFiles: string[] = [];
  
  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith('.jsx') || path.endsWith('.tsx')) {
      const result = transformJSX(content, path);
      if (result.errors.length > 0) {
        errors.push(`Error transforming ${path}: ${result.errors.join(', ')}`);
      } else {
        transformedFiles[path] = result.code;
      }
    } else if (path.endsWith('.css')) {
      cssFiles.push(`/* ${path} */\n${content}`);
    } else if (path.endsWith('.html')) {
      htmlFiles.push(content);
    }
  }
  
  if (errors.length > 0 && Object.keys(transformedFiles).length === 0) {
    return {
      html: '',
      errors,
      warnings,
      projectType: 'react'
    };
  }
  
  // Create bundled HTML
  const cssContent = cssFiles.join('\n\n');
  const transformedEntry = transformedFiles[entryPath] || '';
  
  // Process all component code
  let appComponentName = 'App';
  let entryComponentCode = '';
  
  const allComponents = Object.entries(transformedFiles)
    .map(([path, code]) => {
      // Remove import statements and process exports
      let processedCode = code
        .replace(/import\s+.*?from\s+['"]react['"];?/g, '')
        .replace(/import\s+.*?from\s+['"]react-dom['"];?/g, '')
        .replace(/import\s+.*?from\s+['"][^'"]+['"];?/g, '// Import removed for bundling');
      
      // Store entry component code separately
      if (path === entryPath) {
        entryComponentCode = processedCode;
        // Extract component name
        const defaultExportMatch = processedCode.match(/export\s+default\s+(\w+)/);
        if (defaultExportMatch) {
          appComponentName = defaultExportMatch[1];
        } else {
          const functionMatch = processedCode.match(/(?:function|const|var|let)\s+(\w+)\s*[=\(]/);
          if (functionMatch) {
            appComponentName = functionMatch[1];
          }
        }
      }
      
      return `// ${path}\n${processedCode}`;
    })
    .join('\n\n');
  
  // Create a variable to hold the entry component
  const entryComponentVar = `__EntryComponent_${Date.now()}__`;
  
  // Create HTML wrapper
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React Preview</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    ${cssContent}
  </style>
</head>
<body>
  <div id="root"></div>
  
  <!-- React and ReactDOM from CDN -->
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  
  <script>
    const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, Fragment, useReducer, useLayoutEffect, useImperativeHandle, forwardRef, memo, lazy, Suspense } = React;
    
    // Error boundary component
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
      }
      
      static getDerivedStateFromError(error) {
        return { hasError: true, error };
      }
      
      componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        console.error('React Error:', error, errorInfo);
      }
      
      render() {
        if (this.state.hasError) {
          return React.createElement('div', {
            style: {
              padding: '2rem',
              color: '#ff6b6b',
              fontFamily: 'monospace',
              background: '#1a1a1a',
              minHeight: '100vh',
              whiteSpace: 'pre-wrap'
            }
          }, [
            React.createElement('h1', { key: 'title', style: { marginBottom: '1rem' } }, 'React Error'),
            React.createElement('pre', { key: 'error' }, this.state.error?.toString() || 'Unknown error'),
            this.state.errorInfo && React.createElement('pre', { key: 'stack', style: { marginTop: '1rem', fontSize: '0.8rem', color: '#888' } }, this.state.errorInfo.componentStack)
          ]);
        }
        return this.props.children;
      }
    }
    
    // Simple module system
    window.require = function(path) {
      if (path === 'react' || path.includes('react')) {
        return React;
      }
      if (path === 'react-dom' || path.includes('react-dom')) {
        return ReactDOM;
      }
      return {};
    };
    
    try {
      // All transformed components
      ${allComponents}
      
      // Store entry component in a global variable
      window.${entryComponentVar} = null;
      
      // Execute all components
      ${allComponents}
      
      // Extract entry component
      if (typeof ${appComponentName} !== 'undefined') {
        window.${entryComponentVar} = ${appComponentName};
      } else {
        // Try to find any component in global scope
        const componentNames = Object.keys(window).filter(k => 
          typeof window[k] === 'function' && 
          k[0] === k[0].toUpperCase() &&
          k !== 'ErrorBoundary' &&
          !k.startsWith('__')
        );
        if (componentNames.length > 0) {
          window.${entryComponentVar} = window[componentNames[0]];
        }
      }
      
      // Entry point execution
      const rootElement = document.getElementById('root');
      if (!rootElement) {
        throw new Error('Root element not found');
      }
      
      const root = ReactDOM.createRoot(rootElement);
      const AppComponent = window.${entryComponentVar};
      
      if (!AppComponent) {
        root.render(
          React.createElement('div', { 
            style: { padding: '2rem', textAlign: 'center', color: '#666' } 
          }, 'Component not found. Please ensure your entry file exports a default component.')
        );
      } else {
        root.render(
          React.createElement(ErrorBoundary, null,
            React.createElement(AppComponent, null)
          )
        );
      }
    } catch (error) {
      document.getElementById('root').innerHTML = \`
        <div style="padding: 2rem; color: #ff6b6b; font-family: monospace; background: #1a1a1a; min-height: 100vh;">
          <h1>Runtime Error</h1>
          <pre style="white-space: pre-wrap;">\${error.toString()}</pre>
          <pre style="margin-top: 1rem; font-size: 0.8rem; color: #888;">\${error.stack || ''}</pre>
        </div>
      \`;
      console.error('Runtime error:', error);
    }
  </script>
</body>
</html>
  `.trim();
  
  return {
    html,
    errors,
    warnings,
    projectType: 'react'
  };
}

/**
 * Bundle Vue project (placeholder for future implementation)
 */
export function bundleVueProject(files: Record<string, string>): BundledProject {
  return {
    html: '',
    errors: ['Vue bundling not yet implemented'],
    warnings: [],
    projectType: 'vue'
  };
}

/**
 * Bundle Svelte project (placeholder for future implementation)
 */
export function bundleSvelteProject(files: Record<string, string>): BundledProject {
  return {
    html: '',
    errors: ['Svelte bundling not yet implemented'],
    warnings: [],
    projectType: 'svelte'
  };
}

/**
 * Bundle plain HTML project
 */
export function bundleHTMLProject(files: Record<string, string>): BundledProject {
  const htmlFile = 'index.html' in files ? 'index.html' : Object.keys(files).find(path => path.endsWith('.html')) || '';
  const cssFiles = Object.entries(files).filter(([path]) => path.endsWith('.css'));
  const jsFiles = Object.entries(files).filter(([path]) => 
    path.endsWith('.js') && !path.endsWith('.jsx')
  );
  
  if (!htmlFile) {
    return {
      html: '',
      errors: ['No HTML file found'],
      warnings: [],
      projectType: 'html'
    };
  }
  
  let html = files[htmlFile];
  
  // Inject CSS
  const cssContent = cssFiles.map(([, content]) => content).join('\n\n');
  if (cssContent && html.includes('</head>')) {
    html = html.replace('</head>', `<style>${cssContent}</style></head>`);
  } else if (cssContent) {
    html = html.replace('</body>', `<style>${cssContent}</style></body>`);
  }
  
  // Inject JS
  const jsContent = jsFiles.map(([, content]) => content).join('\n\n');
  if (jsContent && html.includes('</body>')) {
    html = html.replace('</body>', `<script>${jsContent}</script></body>`);
  } else if (jsContent) {
    html = `${html}<script>${jsContent}</script>`;
  }
  
  return {
    html,
    errors: [],
    warnings: [],
    projectType: 'html'
  };
}

/**
 * Main bundler function
 */
export function bundleProject(files: Record<string, string>): BundledProject {
  const projectType = detectProjectType(files);
  
  switch (projectType) {
    case 'react':
      return bundleReactProject(files);
    case 'vue':
      return bundleVueProject(files);
    case 'svelte':
      return bundleSvelteProject(files);
    case 'html':
      return bundleHTMLProject(files);
    default:
      return {
        html: '',
        errors: ['Unknown project type'],
        warnings: [],
        projectType: 'unknown'
      };
  }
}

/**
 * Clear transform cache
 */
export function clearCache(): void {
  transformCache.clear();
}
