/**
 * quick-smoke.js — Fast single-generation test for CI or quick verification
 *
 * Runs one generation (React todo by default) and reports pass/fail.
 * Complete in ~60–90 seconds. Use before the full E2E suite.
 *
 * Usage:
 *   node test/e2e/quick-smoke.js
 *   node test/e2e/quick-smoke.js --framework vue
 *
 * Server: BASE_URL (default http://localhost:5001), e.g. npm run dev
 */
import crypto from 'crypto';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const FRAMEWORK = process.argv.find((a, i) => process.argv[i - 1] === '--framework') || 'react';
const TIMEOUT = parseInt(process.env.SMOKE_TIMEOUT, 10) || 120_000;

const SMOKE_VARIANTS = {
  react: {
    prompt: 'Build a todo app where users can add, complete, and delete tasks. Use React and Tailwind CSS.',
    requirements: { framework: 'react', styling: 'tailwind', complexity: 'simple', projectType: 'web app' },
  },
  vue: {
    prompt: 'Build a todo app where users can add, complete, and delete tasks. Use Vue 3 and Tailwind CSS.',
    requirements: { framework: 'vue', styling: 'tailwind', complexity: 'simple', projectType: 'web app' },
  },
  vanilla: {
    prompt: 'Build a todo app with HTML, CSS, and vanilla JavaScript. No frameworks.',
    requirements: { framework: 'vanilla', styling: 'css', complexity: 'simple', projectType: 'web app' },
  },
};

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

async function postJson(path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
      try {
        events.push({ event: eventName, data: JSON.parse(dataLines.join('\n')) });
      } catch {
        /* ignore */
      }
    }
  }
  return events;
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.log(`  ✗ ${msg}`);
}
function warn(msg) {
  console.log(`  ⚠ ${msg}`);
}

async function run() {
  const variant = SMOKE_VARIANTS[FRAMEWORK];
  if (!variant) {
    console.error(`Unknown framework: ${FRAMEWORK}. Options: ${Object.keys(SMOKE_VARIANTS).join(', ')}`);
    process.exit(1);
  }

  const sessionId = crypto.randomUUID();
  const sessionHeaders = { 'X-Session-Id': sessionId };

  console.log(`\n Quick Smoke Test — ${FRAMEWORK}\n`);
  let allPassed = true;

  try {
    const { status, data } = await getJson('/health');
    if (status === 200) ok(`Server healthy (agent: ${data.agentVersion ?? '?'})`);
    else {
      fail(`Server returned ${status}`);
      process.exit(1);
    }
  } catch (e) {
    fail(`Server not reachable: ${e.message}`);
    process.exit(1);
  }

  console.log('\n[1/3] Analyze');
  const t1 = Date.now();
  const { status: as, data: analysis } = await postJson('/api/analyze', {
    prompt: variant.prompt,
    framework: mapFramework(variant.requirements.framework),
    styling: 'auto',
  });
  if (as === 200) ok(`Framework detected: ${analysis.framework} (${Date.now() - t1}ms)`);
  else {
    fail(`Analyze failed: ${JSON.stringify(analysis)}`);
    process.exit(1);
  }

  console.log('\n[2/3] Plan');
  const t2 = Date.now();
  const requirements = buildPlanRequirements(variant, analysis);
  const { status: ps, data: plan } = await postJson('/api/plan', { requirements });
  if (ps === 200) {
    ok(`Plan: ${plan.files?.length} files (sorted: ${plan._sortedByDependency})`);
    if (plan._sortedByDependency) ok('Topological sort applied ✓');
    else warn('Topological sort NOT applied — check planner/validators.js');
  } else {
    fail(`Plan failed: ${JSON.stringify(plan)}`);
    process.exit(1);
  }

  console.log('\n[3/3] Generate');
  const t3 = Date.now();
  const genRequirements = buildPlanRequirements(variant, null);
  const res = await fetch(`${BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders },
    body: JSON.stringify({ prompt: variant.prompt, requirements: genRequirements, plan }),
  });

  if (res.status === 202) {
    const genData = await res.json();
    const jobId = genData.jobId;
    ok(`Queued (jobId: ${jobId})`);
    process.stdout.write('  Waiting');

    const deadline = Date.now() + TIMEOUT;
    let finalStatus;
    while (Date.now() < deadline) {
      await sleep(3000);
      process.stdout.write('.');
      const { data: s } = await getJson(`/api/generate/${jobId}/status`);
      if (s.status === 'complete') {
        finalStatus = s;
        break;
      }
      if (s.status === 'failed') {
        fail(`\n  Generation failed: ${s.errorMessage}`);
        process.exit(1);
      }
    }

    if (!finalStatus) {
      fail('\n  Timed out');
      process.exit(1);
    }
    console.log();
    ok(
      `Complete: ${finalStatus.filesGenerated}/${finalStatus.totalFiles} files (${Math.round((Date.now() - t3) / 1000)}s)`,
    );

    if (finalStatus.validationResult) {
      const vr = finalStatus.validationResult;
      if (vr.initialIssues === 0) ok('Zero import errors (clean generation)');
      else if (vr.remainingIssues === 0) ok(`Import errors fixed: ${vr.initialIssues} → 0`);
      else {
        fail(`Import errors remain: ${vr.remainingIssues}/${vr.initialIssues}`);
        allPassed = false;
      }
      if (vr.missingPackages?.length > 0) warn(`Auto-patched packages: ${vr.missingPackages.join(', ')}`);
    }
  } else if (res.status === 200) {
    const text = await res.text();
    const events = parseSseText(text);
    const errEv = events.find((e) => e.event === 'generation_error');
    if (errEv) {
      fail(errEv.data?.error || 'generation_error');
      process.exit(1);
    }
    const done = events.find((e) => e.event === 'generation_complete');
    if (!done?.data?.projectId) {
      fail('SSE completed without generation_complete / projectId');
      process.exit(1);
    }
    ok(
      `Generated (${Math.round((Date.now() - t3) / 1000)}s, SSE) — projectId: ${done.data.projectId}`,
    );
  } else {
    const t = await res.text();
    fail(`Generate failed (${res.status}): ${t.slice(0, 500)}`);
    process.exit(1);
  }

  console.log(`\n${allPassed ? '✓ SMOKE PASS' : '✗ SMOKE FAIL'}\n`);
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
