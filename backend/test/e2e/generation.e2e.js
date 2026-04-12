/**
 * E2E Generation Test Suite
 * Run: node test/e2e/generation.e2e.js
 *      node test/e2e/generation.e2e.js --variant react-todo
 * Server: npm run dev (port 5001). Optional: npm run worker for async 202 mode.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, 'reports');
fs.mkdirSync(REPORTS_DIR, { recursive: true });

const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const TIMEOUT_MS = parseInt(process.env.E2E_TIMEOUT, 10) || 150_000;
const POLL_INTERVAL_MS = 3_000;
const SPECIFIC_VARIANT = process.argv.find((a, i) => process.argv[i - 1] === '--variant');
const REPORT_FORMAT = process.argv.find((a, i) => process.argv[i - 1] === '--report') || 'both';

function mapFramework(fw) {
  if (fw === 'vanilla') return 'vanilla-js';
  return fw;
}

function mapStylingToStylingFramework(styling) {
  const m = { tailwind: 'tailwind', css: 'plain-css', 'css-modules': 'css-modules' };
  return m[styling] || styling || 'tailwind';
}

function buildPlanRequirements(variant, analysis) {
  const r = variant.requirements;
  return {
    framework: mapFramework(r.framework),
    stylingFramework: mapStylingToStylingFramework(r.styling),
    complexity: r.complexity,
    projectType: typeof r.projectType === 'string' ? r.projectType.trim() : 'web-app',
    prompt: variant.prompt,
    ...(analysis ? { analysis } : {}),
  };
}

const TEST_VARIANTS = [
  { id: 'react-todo', label: 'React + Tailwind — Todo App (Simple)', prompt: 'Build a todo app where users can add, complete, and delete tasks. Use React and Tailwind CSS.', requirements: { framework: 'react', styling: 'tailwind', complexity: 'simple', projectType: 'web app' }, expectedChecks: ['entry-point', 'import-resolution', 'package-json', 'react-jsx', 'tailwind-classes'], minFiles: 3, maxFiles: 8 },
  { id: 'react-dashboard', label: 'React + Tailwind — Dashboard (Medium)', prompt: 'Build an analytics dashboard with a sidebar, header, and 4 metric cards showing revenue, users, orders, and conversion rate. Include a line chart for the last 30 days. Use React and Tailwind CSS.', requirements: { framework: 'react', styling: 'tailwind', complexity: 'medium', projectType: 'dashboard' }, expectedChecks: ['entry-point', 'import-resolution', 'package-json', 'react-jsx', 'no-duplicate-exports'], minFiles: 6, maxFiles: 20 },
  { id: 'react-auth', label: 'React + CSS — Auth Flow (Medium)', prompt: 'Build a login and registration flow with form validation, error messages, and a protected dashboard page. Use React with CSS modules.', requirements: { framework: 'react', styling: 'css-modules', complexity: 'medium', projectType: 'web app' }, expectedChecks: ['entry-point', 'import-resolution', 'package-json', 'react-jsx', 'hooks-valid'], minFiles: 5, maxFiles: 15 },
  { id: 'react-ecommerce', label: 'React + Tailwind — E-commerce (Complex)', prompt: 'Build an e-commerce product listing page with filtering by category and price, a product card grid, and a shopping cart sidebar that shows item count and total. Use React and Tailwind CSS.', requirements: { framework: 'react', styling: 'tailwind', complexity: 'complex', projectType: 'e-commerce' }, expectedChecks: ['entry-point', 'import-resolution', 'package-json', 'react-jsx', 'no-duplicate-exports', 'state-management'], minFiles: 8, maxFiles: 25 },
  { id: 'react-multi-page', label: 'React Router — Multi-page App (Medium)', prompt: 'Build a multi-page app with React Router. Pages: Home (hero + features), About (team section), Contact (form with email/message fields). Include a shared Navbar and Footer.', requirements: { framework: 'react', styling: 'tailwind', complexity: 'medium', projectType: 'website' }, expectedChecks: ['entry-point', 'import-resolution', 'package-json', 'react-jsx', 'router-present'], minFiles: 7, maxFiles: 18 },
  { id: 'vue-todo', label: 'Vue 3 + Tailwind — Todo App (Simple)', prompt: 'Build a todo app where users can add, complete, and delete tasks. Use Vue 3 Composition API and Tailwind CSS.', requirements: { framework: 'vue', styling: 'tailwind', complexity: 'simple', projectType: 'web app' }, expectedChecks: ['entry-point', 'import-resolution', 'package-json', 'vue-sfc', 'tailwind-classes'], minFiles: 3, maxFiles: 8 },
  { id: 'vue-dashboard', label: 'Vue 3 + Tailwind — Dashboard (Medium)', prompt: 'Build a project management dashboard with Vue 3. Show task boards (Kanban columns: Todo, In Progress, Done), a task count summary, and a team member list.', requirements: { framework: 'vue', styling: 'tailwind', complexity: 'medium', projectType: 'dashboard' }, expectedChecks: ['entry-point', 'import-resolution', 'package-json', 'vue-sfc'], minFiles: 5, maxFiles: 18 },
  { id: 'vanilla-landing', label: 'Vanilla JS — Landing Page (Simple)', prompt: 'Build a SaaS landing page with a hero section, features section (3 cards), pricing section (3 tiers), and contact form. Pure HTML, CSS, and vanilla JavaScript.', requirements: { framework: 'vanilla', styling: 'css', complexity: 'simple', projectType: 'landing page' }, expectedChecks: ['entry-point', 'html-structure', 'css-valid'], minFiles: 2, maxFiles: 6 },
  { id: 'vanilla-game', label: 'Vanilla JS — Browser Game (Medium)', prompt: 'Build a snake game that runs in the browser. Use HTML canvas, CSS, and vanilla JavaScript. Include score tracking, game over screen, and restart button.', requirements: { framework: 'vanilla', styling: 'css', complexity: 'medium', projectType: 'game' }, expectedChecks: ['entry-point', 'html-structure', 'canvas-present'], minFiles: 2, maxFiles: 5 },
  { id: 'edge-context-heavy', label: 'React — Context + Hooks Heavy [EDGE]', prompt: 'Build a personal finance tracker with React. Features: expense tracking with categories, monthly budget setting, spending charts, transaction history with filtering, and a settings page. Use React Context for state, custom hooks for data logic, Tailwind for styling.', requirements: { framework: 'react', styling: 'tailwind', complexity: 'complex', projectType: 'finance app' }, expectedChecks: ['entry-point', 'import-resolution', 'package-json', 'react-jsx', 'no-duplicate-exports'], minFiles: 12, maxFiles: 30, isEdgeCase: true, edgeCaseNote: '20+ files' },
  { id: 'edge-cross-imports', label: 'React — Cross-imported [EDGE]', prompt: 'Build a real-time chat app with React. Features: channel list sidebar, message thread view, message input with emoji picker, online user list, and notifications. Use React hooks and Context API for state management.', requirements: { framework: 'react', styling: 'tailwind', complexity: 'complex', projectType: 'chat app' }, expectedChecks: ['entry-point', 'import-resolution', 'package-json', 'react-jsx', 'no-duplicate-exports'], minFiles: 10, maxFiles: 25, isEdgeCase: true, edgeCaseNote: 'complex graph' },
  { id: 'edge-ambiguous-prompt', label: 'React — Ambiguous Prompt [EDGE]', prompt: 'Build a social media app.', requirements: { framework: 'react', styling: 'tailwind', complexity: 'medium', projectType: 'web app' }, expectedChecks: ['entry-point', 'import-resolution', 'package-json'], minFiles: 4, maxFiles: 20, isEdgeCase: true, edgeCaseNote: 'minimal spec' },
];

async function post(path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json, headers: res.headers };
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

function parseSseText(text) {
  const events = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    if (!block.trim()) continue;
    let eventName = 'message';
    const dataLines = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^\s/, ''));
    }
    if (dataLines.length) {
      try { events.push({ event: eventName, data: JSON.parse(dataLines.join('\n')) }); } catch { /* */ }
    }
  }
  return events;
}

async function runAnalyze(prompt, requirements) {
  const start = Date.now();
  const { status, body } = await post('/api/analyze', { prompt, framework: mapFramework(requirements.framework), styling: 'auto' });
  if (status !== 200) throw new Error(`Analyze failed (${status}): ${JSON.stringify(body)}`);
  return { analysis: body, durationMs: Date.now() - start };
}

async function runPlan(variant, analysis) {
  const start = Date.now();
  const requirements = buildPlanRequirements(variant, analysis);
  const { status, body } = await post('/api/plan', { requirements });
  if (status !== 200) throw new Error(`Plan failed (${status}): ${JSON.stringify(body)}`);
  return { plan: body, durationMs: Date.now() - start };
}

async function runGenerateAndWait(variant, plan, sessionHeaders) {
  const start = Date.now();
  const requirements = buildPlanRequirements(variant, null);
  const res = await fetch(`${BASE_URL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...sessionHeaders }, body: JSON.stringify({ prompt: variant.prompt, requirements, plan }) });

  if (res.status === 202) {
    const body = await res.json();
    const jobId = body.jobId;
    if (!jobId) throw new Error('No jobId in 202 response');
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const { body: st } = await get(`/api/generate/${jobId}/status`);
      if (st.status === 'complete') {
        return { jobId, projectId: st.storagePath, durationMs: Date.now() - start, filesGenerated: st.filesGenerated, totalFiles: st.totalFiles, validationResult: st.validationResult || null, mode: 'async' };
      }
      if (st.status === 'failed') throw new Error(`Generation failed: ${st.errorMessage || 'unknown'}`);
      process.stdout.write('.');
    }
    throw new Error(`Generation timed out after ${TIMEOUT_MS}ms`);
  }

  if (res.status !== 200) {
    const t = await res.text();
    throw new Error(`Generate failed ${res.status}: ${t.slice(0, 500)}`);
  }

  const text = await res.text();
  const events = parseSseText(text);
  const errEv = events.find((e) => e.event === 'generation_error');
  if (errEv) throw new Error(errEv.data?.error || 'generation_error');
  const done = events.find((e) => e.event === 'generation_complete');
  if (!done || !done.data?.projectId) throw new Error('SSE completed without generation_complete / projectId');
  return { jobId: done.data.generationId || null, projectId: done.data.projectId, durationMs: Date.now() - start, filesGenerated: done.data.metrics?.filesGenerated, totalFiles: null, validationResult: null, mode: 'sse' };
}

async function getProjectFiles(projectId) {
  if (!projectId) return null;
  try {
    const res = await fetch(`${BASE_URL}/download/${encodeURIComponent(projectId)}`);
    if (res.status !== 200) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buffer);
    const files = {};
    for (const [filename, file] of Object.entries(zip.files)) {
      if (!file.dir) files[filename] = await file.async('string');
    }
    return files;
  } catch {
    return null;
  }
}

function checkEntryPoint(files, variant) {
  const framework = variant.requirements.framework;
  const fileList = Object.keys(files);
  if (framework === 'vanilla') {
    const hasHtml = fileList.some((f) => f.endsWith('.html'));
    return { pass: hasHtml, detail: hasHtml ? 'index.html present' : `No .html file. Files: ${fileList.join(', ')}` };
  }
  if (framework === 'vue') {
    const hasMain = fileList.some((f) => /main\.(js|ts)$/.test(f));
    const hasApp = fileList.some((f) => /App\.vue$/.test(f));
    return { pass: hasMain || hasApp, detail: (hasMain || hasApp) ? `Vue entry found` : `Missing main/App.vue` };
  }
  const hasMain = fileList.some((f) => /main\.(jsx?|tsx?)$/.test(f));
  const hasIndex = fileList.some((f) => /index\.(jsx?|tsx?)$/.test(f));
  return { pass: hasMain || hasIndex, detail: (hasMain || hasIndex) ? 'React entry found' : 'No main/index JSX' };
}

function checkImportResolution(files) {
  const issues = [];
  for (const [filePath, code] of Object.entries(files)) {
    if (!code || typeof code !== 'string') continue;
    if (!/\.(js|jsx|ts|tsx|vue)$/.test(filePath)) continue;
    const fileDir = path.dirname(filePath);
    const importRe = /import\s+(?:type\s+)?(?:[\w*{][^'"]*from\s+)?['"]([^'"]+)['"]/g;
    let m;
    while ((m = importRe.exec(code)) !== null) {
      const specifier = m[1];
      if (!specifier.startsWith('.')) continue;
      const resolved = path.normalize(path.join(fileDir, specifier)).replace(/\\/g, '/');
      const extensions = ['', '.jsx', '.js', '.tsx', '.ts', '.vue', '.json'];
      const found = extensions.some((ext) => {
        const c = resolved + ext;
        return files[c] || files[c.replace(/^\//, '')];
      }) || extensions.some((ext) => {
        const ic = `${resolved}/index${ext}`;
        return files[ic] || files[ic.replace(/^\//, '')];
      });
      if (!found) issues.push({ file: filePath, import: specifier, resolved });
    }
  }
  return { pass: issues.length === 0, detail: issues.length === 0 ? 'All relative imports resolve' : `${issues.length} unresolved import(s)`, issues };
}

function checkPackageJson(files) {
  const pkgFile = Object.keys(files).find((f) => f === 'package.json' || f.endsWith('/package.json'));
  if (!pkgFile) return { pass: false, detail: 'package.json not found' };
  let pkg;
  try { pkg = JSON.parse(files[pkgFile]); } catch { return { pass: false, detail: 'Invalid JSON' }; }
  const declared = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
  const used = new Set();
  const builtins = new Set(['react', 'react-dom', 'vue', 'path', 'fs', 'crypto', 'url', 'http', 'https', 'os', 'events', 'stream', 'buffer']);
  for (const [filePath, code] of Object.entries(files)) {
    if (!/\.(js|jsx|ts|tsx|vue)$/.test(filePath)) continue;
    const re = /import\s+(?:[\s\S]*?from\s+)?['"]([^.'"@][^'"]*)['"]/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const name = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
      if (name && !builtins.has(name)) used.add(name);
    }
  }
  const missing = [...used].filter((p) => !declared.has(p));
  return { pass: missing.length === 0, detail: missing.length === 0 ? 'Deps OK' : `Missing: ${missing.join(', ')}`, missing, declared: [...declared] };
}

function isReactEntryBootstrap(filePath) {
  const base = path.basename(filePath);
  return base === 'main.jsx' || base === 'main.tsx';
}

function checkReactJsx(files) {
  const jsxFiles = Object.entries(files).filter(([f]) => /\.(jsx|tsx)$/.test(f));
  if (jsxFiles.length === 0) return { pass: false, detail: 'No JSX files' };
  const issues = [];
  for (const [filePath, code] of jsxFiles) {
    if (!code) continue;
    if (!/<[A-Z][a-zA-Z]*|<[a-z]+[\s/>]|<>|<\//.test(code)) issues.push(filePath);
    if (!isReactEntryBootstrap(filePath) && !/export\s+(?:default|function|const|class)/.test(code)) {
      issues.push(`${filePath} (no export)`);
    }
  }
  return { pass: issues.length === 0, detail: issues.length === 0 ? 'JSX OK' : issues.slice(0, 5).join(', '), issues };
}

function checkVueSfc(files) {
  const vueFiles = Object.entries(files).filter(([f]) => f.endsWith('.vue'));
  if (vueFiles.length === 0) return { pass: false, detail: 'No .vue files' };
  const issues = [];
  for (const [filePath, code] of vueFiles) {
    if (!code) continue;
    if (!/<template>/.test(code) && !/<template\s/.test(code)) issues.push(`${filePath} (no template)`);
    if (!/<script/.test(code)) issues.push(`${filePath} (no script)`);
  }
  return { pass: issues.length === 0, detail: issues.length === 0 ? 'Vue OK' : issues.join(', '), issues };
}

function checkHtmlStructure(files) {
  const htmlFiles = Object.entries(files).filter(([f]) => f.endsWith('.html'));
  if (htmlFiles.length === 0) return { pass: false, detail: 'No HTML' };
  const issues = [];
  for (const [filePath, code] of htmlFiles) {
    if (code && !/<html/.test(code) && !/<body/.test(code)) issues.push(filePath);
  }
  return { pass: issues.length === 0, detail: issues.length === 0 ? 'HTML OK' : issues.join(', '), issues };
}

function checkNoDuplicateExports(files) {
  const exportedNames = {};
  const duplicates = [];
  for (const [filePath, code] of Object.entries(files)) {
    if (!code || !/\.(js|jsx|ts|tsx|vue)$/.test(filePath)) continue;
    const re = /export\s+(?:default\s+)?(?:function|class|const|let|var|enum)\s+(\w+)/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const name = m[1];
      if (exportedNames[name]) duplicates.push({ name, files: [exportedNames[name], filePath] });
      else exportedNames[name] = filePath;
    }
  }
  return { pass: duplicates.length === 0, detail: duplicates.length === 0 ? 'No dup exports' : duplicates.map((d) => `"${d.name}"`).join('; '), duplicates };
}

function checkTailwindClasses(files) {
  const jsxFiles = Object.entries(files).filter(([f]) => /\.(jsx|tsx|vue|html)$/.test(f));
  let tailwindUsage = 0;
  let fileCount = 0;
  for (const [, code] of jsxFiles) {
    if (!code) continue;
    fileCount++;
    if (/className=["'][^"']*(?:flex|grid|text-|bg-|p-|m-|w-|h-|border|rounded|shadow)/.test(code)) tailwindUsage++;
  }
  const ratio = fileCount > 0 ? tailwindUsage / fileCount : 0;
  return { pass: ratio >= 0.3, detail: `${tailwindUsage}/${fileCount} (${Math.round(ratio * 100)}%)`, ratio };
}

function checkHooksValid(files) {
  const hookFiles = Object.entries(files).filter(([f]) => /hooks?\//i.test(f) && /\.(js|ts|jsx|tsx)$/.test(f));
  if (hookFiles.length === 0) return { pass: true, detail: 'No hook files' };
  const issues = [];
  for (const [filePath, code] of hookFiles) {
    if (code && !/export\s+(?:default\s+)?(?:function|const)\s+use[A-Z]/.test(code)) issues.push(filePath);
  }
  return { pass: issues.length === 0, detail: issues.length === 0 ? 'Hooks OK' : issues.join(', '), issues };
}

function checkRouterPresent(files) {
  let found = false;
  for (const [, code] of Object.entries(files)) {
    if (code && /react-router|BrowserRouter|Route\s|<Routes|createBrowserRouter/.test(code)) { found = true; break; }
  }
  return { pass: found, detail: found ? 'Router found' : 'No router' };
}

function checkStateManagement(files) {
  let found = false;
  for (const [, code] of Object.entries(files)) {
    if (code && /useReducer|createContext|zustand|Redux|useState.*\[\]|useState.*{}/.test(code)) { found = true; break; }
  }
  return { pass: found, detail: found ? 'State OK' : 'No state' };
}

function checkCanvasPresent(files) {
  let found = false;
  for (const [, code] of Object.entries(files)) {
    if (code && /<canvas|getContext\('2d'\)|getContext\("2d"\)/.test(code)) { found = true; break; }
  }
  return { pass: found, detail: found ? 'Canvas OK' : 'No canvas' };
}

function checkCssValid(files) {
  const cssFiles = Object.entries(files).filter(([f]) => f.endsWith('.css'));
  if (cssFiles.length === 0) return { pass: true, detail: 'No CSS' };
  const issues = [];
  for (const [filePath, code] of cssFiles) {
    if (!code) continue;
    const open = (code.match(/\{/g) || []).length;
    const close = (code.match(/\}/g) || []).length;
    if (Math.abs(open - close) > 2) issues.push(filePath);
  }
  return { pass: issues.length === 0, detail: issues.length === 0 ? 'CSS OK' : issues.join(', '), issues };
}

const CHECK_REGISTRY = {
  'entry-point': checkEntryPoint,
  'import-resolution': checkImportResolution,
  'package-json': checkPackageJson,
  'react-jsx': checkReactJsx,
  'vue-sfc': checkVueSfc,
  'html-structure': checkHtmlStructure,
  'no-duplicate-exports': checkNoDuplicateExports,
  'tailwind-classes': checkTailwindClasses,
  'hooks-valid': checkHooksValid,
  'router-present': checkRouterPresent,
  'state-management': checkStateManagement,
  'canvas-present': checkCanvasPresent,
  'css-valid': checkCssValid,
};

async function runVariant(variant) {
  const result = {
    id: variant.id,
    label: variant.label,
    isEdgeCase: variant.isEdgeCase || false,
    edgeCaseNote: variant.edgeCaseNote || null,
    startTime: new Date().toISOString(),
    phases: {},
    checks: {},
    files: null,
    fileCount: 0,
    durationMs: 0,
    overall: 'pass',
    errors: [],
    warnings: [],
  };
  const totalStart = Date.now();
  const sessionHeaders = { 'X-Session-Id': crypto.randomUUID() };

  try {
    process.stdout.write('  [analyze] ');
    const a0 = Date.now();
    const { analysis } = await runAnalyze(variant.prompt, variant.requirements);
    result.phases.analyze = { pass: true, durationMs: Date.now() - a0, framework: analysis.framework, sessionId: analysis.sessionId };
    process.stdout.write(`ok (${result.phases.analyze.durationMs}ms)\n`);

    process.stdout.write('  [plan]    ');
    const planStart = Date.now();
    const { plan } = await runPlan(variant, analysis);
    result.phases.plan = { pass: true, durationMs: Date.now() - planStart, fileCount: plan.files?.length || 0, files: plan.files || [], sortedByDependency: plan._sortedByDependency || false };
    const fc = plan.files?.length || 0;
    if (fc < variant.minFiles) result.warnings.push(`Plan files ${fc} < min ${variant.minFiles}`);
    if (fc > variant.maxFiles) result.warnings.push(`Plan files ${fc} > max ${variant.maxFiles}`);
    process.stdout.write(`ok (${fc} files)\n`);

    process.stdout.write('  [generate] ');
    const genResult = await runGenerateAndWait(variant, plan, sessionHeaders);
    result.phases.generate = { pass: true, durationMs: genResult.durationMs, filesGenerated: genResult.filesGenerated, totalFiles: genResult.totalFiles, mode: genResult.mode, jobId: genResult.jobId, projectId: genResult.projectId, validationResult: genResult.validationResult };
    if (genResult.durationMs > 120_000) result.warnings.push(`Slow: ${Math.round(genResult.durationMs / 1000)}s`);
    process.stdout.write(`ok (${Math.round(genResult.durationMs / 1000)}s, ${genResult.mode})\n`);

    process.stdout.write('  [inspect] ');
    if (genResult.projectId) {
      const projectFiles = await getProjectFiles(genResult.projectId);
      if (projectFiles) {
        result.files = projectFiles;
        result.fileCount = Object.keys(projectFiles).length;
        process.stdout.write(`ok (${result.fileCount} files)\n`);
      } else {
        process.stdout.write('skip\n');
        result.warnings.push('Download failed');
      }
    } else {
      process.stdout.write('skip\n');
      result.warnings.push('No projectId');
    }

    if (result.files) {
      process.stdout.write('  [checks]  ');
      for (const checkId of variant.expectedChecks) {
        const fn = CHECK_REGISTRY[checkId];
        if (!fn) { result.checks[checkId] = { pass: false, detail: `Unknown: ${checkId}` }; continue; }
        try { result.checks[checkId] = fn(result.files, variant); } catch (e) { result.checks[checkId] = { pass: false, detail: e.message }; }
      }
      const failed = Object.entries(result.checks).filter(([, c]) => !c.pass);
      if (failed.length > 0) {
        process.stdout.write(`fail (${failed.length})\n`);
        result.overall = 'fail';
        result.errors.push(...failed.map(([id, c]) => `[${id}] ${c.detail}`));
      } else {
        process.stdout.write(`ok (${variant.expectedChecks.length})\n`);
      }
    }
  } catch (err) {
    result.overall = 'error';
    result.errors.push(err.message);
    process.stdout.write(`\n  ERROR: ${err.message}\n`);
    for (const phase of ['analyze', 'plan', 'generate']) {
      if (!result.phases[phase]) { result.phases[phase] = { pass: false, error: err.message }; break; }
    }
  }
  result.durationMs = Date.now() - totalStart;
  return result;
}

function generateMarkdownReport(results, startTime) {
  const lines = ['# E2E Report', `Duration: ${Math.round((Date.now() - startTime) / 1000)}s`, `Base: ${BASE_URL}`, ''];
  const passed = results.filter((r) => r.overall === 'pass').length;
  lines.push(`Passed: ${passed}/${results.length}`, '');
  for (const r of results) lines.push(`- ${r.id}: ${r.overall}`);
  return lines.join('\n');
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  console.log(`E2E | ${BASE_URL} | timeout ${TIMEOUT_MS / 1000}s\n`);
  try {
    const { status, body } = await get('/health');
    if (status !== 200) throw new Error('health');
    console.log(`Health OK | ${body.agentVersion}\n`);
  } catch {
    console.error(`No server at ${BASE_URL} — run: npm run dev`);
    process.exit(1);
  }

  const variants = SPECIFIC_VARIANT ? TEST_VARIANTS.filter((v) => v.id === SPECIFIC_VARIANT) : TEST_VARIANTS;
  if (variants.length === 0) {
    console.error(`Unknown variant. Use: ${TEST_VARIANTS.map((v) => v.id).join(', ')}`);
    process.exit(1);
  }

  const startTime = Date.now();
  const results = [];
  for (let i = 0; i < variants.length; i++) {
    console.log(`[${i + 1}/${variants.length}] ${variants[i].label}`);
    const result = await runVariant(variants[i]);
    results.push(result);
    console.log(`  => ${result.overall.toUpperCase()} (${Math.round(result.durationMs / 1000)}s)`);
    result.warnings.forEach((w) => console.log(`  ! ${w}`));
    console.log('');
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonPath = path.join(REPORTS_DIR, `e2e-report-${ts}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ results, meta: { timestamp: new Date().toISOString(), baseUrl: BASE_URL, totalDurationMs: Date.now() - startTime, variantCount: variants.length } }, null, 2));
  if (REPORT_FORMAT === 'both' || REPORT_FORMAT === 'md') {
    fs.writeFileSync(path.join(REPORTS_DIR, `e2e-report-${ts}.md`), generateMarkdownReport(results, startTime));
  }
  console.log(`Reports: ${jsonPath}`);

  const bad = results.filter((r) => r.overall !== 'pass').length;
  process.exit(bad > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
