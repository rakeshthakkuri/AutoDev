// ═══════════════════════════════════════════════════════════════════════════════
// V2 Integration Test Harness
// Runs the full pipeline with mock LLM — no real API calls.
// ═══════════════════════════════════════════════════════════════════════════════

import { ProjectMemory } from '../../src/agents/shared/memory.js';
import { AgentEventEmitter } from '../../src/agents/shared/events.js';
import { validatePlan } from '../../src/agents/planner/validators.js';
import { ReviewerAgent } from '../../src/agents/reviewer/agent.js';
import { ContextBuilder } from '../../src/agents/coder/context.js';
import { CodeValidator } from '../../src/services/validator.js';
import { PHASES, assessQuality, initializeErrorBudget } from '../../src/agents/orchestrator/state.js';
import {
    routeAfterPlanValidation,
    routeAfterGenerate,
    routeAfterReview,
} from '../../src/agents/orchestrator/router.js';

// ─── Mock File Contents ─────────────────────────────────────────────────────

const MOCK_FILES = {
    'package.json': '{"name":"test-app","version":"1.0.0","dependencies":{"react":"^18.2.0","react-dom":"^18.2.0"},"scripts":{"dev":"vite","build":"vite build"}}',
    'index.html': '<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8" /><title>Test App</title></head>\n<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>\n</html>',
    'src/main.jsx': 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\nReactDOM.createRoot(document.getElementById("root")).render(<App />);',
    'src/App.jsx': 'import React from "react";\nimport Hero from "./components/Hero";\n\nexport default function App() {\n  return <div className="app"><Hero title="Hello" subtitle="World" /></div>;\n}',
    'src/components/Hero.jsx': 'import React from "react";\n\nexport default function Hero({ title, subtitle }) {\n  return <section className="hero"><h1>{title}</h1><p>{subtitle}</p></section>;\n}',
    'src/index.css': '* { margin: 0; box-sizing: border-box; }\n.app { font-family: Inter, sans-serif; }\n.hero { padding: 4rem 2rem; text-align: center; }',
};

const MOCK_PLAN = {
    files: [
        { path: 'package.json', purpose: 'Dependencies' },
        { path: 'index.html', purpose: 'HTML entry point' },
        { path: 'src/main.jsx', purpose: 'React mount' },
        { path: 'src/App.jsx', purpose: 'Main component' },
        { path: 'src/components/Hero.jsx', purpose: 'Hero section' },
        { path: 'src/index.css', purpose: 'Global styles' },
    ],
    techStack: ['React', 'Vite'],
    designSystem: { primaryColor: '#3B82F6', fontFamily: 'Inter, sans-serif' },
};

const MOCK_REQUIREMENTS = {
    framework: 'react',
    stylingFramework: 'tailwind',
    complexity: 'simple',
    projectType: 'landing-page',
};

// ─── Harness ─────────────────────────────────────────────────────────────────

/**
 * Run the full v2 pipeline using manual step-through (not LangGraph invoke,
 * to avoid needing a real LLM). Simulates the graph traversal.
 *
 * @param {object} [overrides] - Override mock files for failure injection
 * @param {object} [overrides.fileOverrides] - { path: content } to override specific files
 * @param {string[]} [overrides.failFiles] - Paths that should fail on first attempt
 * @param {boolean} [overrides.invalidPlan] - If true, returns plan without entry point
 */
export async function runMockPipeline(overrides = {}) {
    const events = [];
    const memory = new ProjectMemory();
    const validator = new CodeValidator();

    const emitter = new AgentEventEmitter({
        onProgress: (msg, pct, extra) => events.push({ type: 'status', data: { message: msg, progress: pct, ...extra } }),
        onPlan: (data) => events.push({ type: 'generation_plan', data }),
        onFileGenerated: (data) => events.push({ type: 'file_generated', data }),
        onFileChunk: (data) => events.push({ type: 'file_chunk', data }),
        onError: (data) => events.push({ type: 'file_error', data }),
        onFileFixing: (data) => events.push({ type: 'file_fixing', data }),
        onFileFixed: (data) => events.push({ type: 'file_fixed', data }),
    });

    const plan = overrides.invalidPlan
        ? { ...MOCK_PLAN, files: MOCK_PLAN.files.filter(f => f.path !== 'src/App.jsx' && f.path !== 'src/main.jsx') }
        : MOCK_PLAN;

    const requirements = MOCK_REQUIREMENTS;
    const fileOverrides = overrides.fileOverrides || {};
    const failFiles = new Set(overrides.failFiles || []);
    const attemptCounts = {};

    // ── Phase: PLANNING ──
    const phases = [PHASES.PLANNING];

    // Populate memory from plan
    for (const file of plan.files) {
        memory.addPlannedFile(file.path, file.purpose);
    }
    if (plan.designSystem) memory.setDesignSystem(plan.designSystem);

    // ── Phase: PLAN_VALIDATION ──
    phases.push(PHASES.PLAN_VALIDATION);
    const planValidation = validatePlan(plan, requirements);
    let planRevisions = 0;

    // If invalid and not intentionally testing, skip revisions
    if (!planValidation.valid && !overrides.invalidPlan) {
        // Just proceed
    }

    // ── Phase: GENERATING ──
    phases.push(PHASES.GENERATING);

    // Sort files (configs first)
    const sortedFiles = [...plan.files].sort((a, b) => {
        const priority = (f) => {
            if (f.path === 'package.json') return 0;
            if (f.path.includes('config')) return 1;
            if (f.path.endsWith('.css')) return 2;
            if (f.path.includes('App.') || f.path === 'index.html') return 3;
            return 4;
        };
        return priority(a) - priority(b);
    });

    emitter.emitPlan({
        files: sortedFiles.map(f => ({ path: f.path, purpose: f.purpose })),
        techStack: plan.techStack,
        framework: requirements.framework,
    });
    emitter.emitProgress('Starting generation...', 0);

    // Generate each file
    for (let i = 0; i < sortedFiles.length; i++) {
        const file = sortedFiles[i];
        const filePath = file.path;
        attemptCounts[filePath] = (attemptCounts[filePath] || 0) + 1;

        memory.setFileGenerating(filePath);

        // Get mock content (with overrides and failure injection)
        let content;
        if (failFiles.has(filePath) && attemptCounts[filePath] === 1) {
            // Simulate a file that fails — force it through the fix path
            content = null; // Will be handled below as a forced failure
        } else {
            content = fileOverrides[filePath] || MOCK_FILES[filePath] || `// Generated: ${filePath}\nexport default function Component() { return null; }`;
        }

        // Handle forced failure (null content = simulated LLM failure on first attempt)
        if (content === null) {
            emitter.emitFileFixing({ path: filePath, attempt: 1, errors: ['Simulated generation failure'] });

            // Second attempt succeeds with good code
            const fixedContent = MOCK_FILES[filePath] || `export default function ${filePath.split('/').pop().split('.')[0]}() { return null; }`;
            const fixValidation = validator.validateFile(fixedContent, filePath, requirements.framework);
            const finalFixed = fixValidation.fixedCode || fixedContent;

            memory.setFileFixed(filePath, finalFixed, fixValidation);
            emitter.emitFileFixed({ path: filePath, content: finalFixed, validation: fixValidation });
            emitter.emitFileGenerated({ path: filePath, content: finalFixed, validation: fixValidation });
        } else {
            // Normal path — emit chunk, validate, generate
            emitter.emitFileChunk(filePath, content.substring(0, 50));
            const validation = validator.validateFile(content, filePath, requirements.framework);

            if (validation.isValid || validation.fixedCode) {
                const finalCode = validation.fixedCode || content;
                memory.setFileGenerated(filePath, finalCode, validation);
                emitter.emitFileGenerated({ path: filePath, content: finalCode, validation });
            } else {
                memory.setFileFailed(filePath, validation.errors?.[0] || 'Validation failed');
                emitter.emitFileError({ path: filePath, error: 'Validation failed' });
            }
        }

        const progress = Math.floor(((i + 1) / sortedFiles.length) * 85);
        emitter.emitProgress(`Generated ${filePath}`, progress);
    }

    // ── Phase: REVIEWING ──
    phases.push(PHASES.REVIEWING);
    emitter.emitProgress('Reviewing project...', 90);

    const reviewer = new ReviewerAgent({ validator });
    const reviewResult = await reviewer.reviewProject({ memory, requirements });

    // Route decision
    const routeDecision = routeAfterReview({
        reviewResult: reviewResult.reviewResult,
        fixRounds: 0,
        errorBudget: initializeErrorBudget(plan),
        planRevisions: 0,
    });

    // ── Phase: DONE ──
    phases.push(PHASES.DONE);
    const quality = assessQuality(memory);
    const counts = memory.getStatusCounts();

    const metrics = {
        filesGenerated: counts.generated + counts.fixed,
        filesFixed: counts.fixed,
        filesFailed: counts.failed,
        quality,
        phases,
        reviewDecision: routeDecision,
        totalIssues: reviewResult.reviewResult?.totalIssues || 0,
    };

    emitter.emitProgress('Finalizing...', 98);

    return {
        success: counts.failed === 0,
        memory,
        events,
        metrics,
        plan,
        quality,
        generatedFiles: memory.getGeneratedFiles(),
    };
}

export { MOCK_FILES, MOCK_PLAN, MOCK_REQUIREMENTS };
