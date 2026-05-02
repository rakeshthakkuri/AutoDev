import config from '../../config.js';
import {
    buildDependencyGraph,
    detectCycles,
    sortFilesByDependency,
    reorderPlanFiles,
} from './dependencyGraph.js';

// Tightened to match the frontend UI labels (simple "3-5 files", standard "5-10",
// advanced "8-20"). Bounds include a small upper-tolerance so a slightly-over-
// budget plan still passes — but generations don't sprawl beyond what the UI promised.
const FILE_COUNT_BOUNDS = {
    simple: [3, 7],
    intermediate: [5, 12],
    advanced: [8, 22],
};

const FRAMEWORK_ENTRY_POINTS = {
    'vanilla-js': ['index.html'],
    react: ['src/App.jsx', 'src/main.jsx'],
    'react-ts': ['src/App.tsx', 'src/main.tsx'],
    nextjs: ['app/page.tsx', 'app/page.jsx', 'app/layout.tsx', 'app/layout.jsx'],
    vue: ['src/App.vue', 'src/main.js', 'src/main.ts'],
    svelte: ['src/App.svelte', 'src/main.js'],
    angular: ['src/app/app.component.ts', 'src/main.ts'],
    astro: ['src/pages/index.astro'],
};

const FRAMEWORK_REQUIRED_FILES = {
    nextjs: [{ pattern: 'layout', message: 'Next.js project missing layout file' }],
    angular: [{ pattern: 'app.component', message: 'Angular project missing app component' }],
};

/**
 * Validate a project plan BEFORE generation begins.
 * Returns { valid, errors, warnings }.
 */
export function validatePlan(plan, requirements) {
    const errors = [];
    const warnings = [];
    const files = plan?.files || [];
    const framework = requirements?.framework || config.defaultFramework;
    const complexity = requirements?.complexity || 'intermediate';

    // 1. File count bounds
    const [min, max] = FILE_COUNT_BOUNDS[complexity] || [3, 20];
    if (files.length < min) {
        errors.push({
            type: 'FILE_COUNT_MISMATCH',
            message: `Expected at least ${min} files for ${complexity} complexity, got ${files.length}`,
        });
    }
    if (files.length > max) {
        errors.push({
            type: 'FILE_COUNT_MISMATCH',
            message: `Plan has ${files.length} files; maximum for "${complexity}" complexity is ${max}. Reduce scope or use a higher complexity setting.`,
        });
    }

    // 2. Entry point exists
    const entryPoints = FRAMEWORK_ENTRY_POINTS[framework];
    if (entryPoints) {
        const paths = new Set(files.map(f => f.path || f));
        const hasEntry = entryPoints.some(ep => paths.has(ep));
        if (!hasEntry) {
            errors.push({
                type: 'MISSING_ENTRY',
                message: `Missing entry point. Expected one of: ${entryPoints.join(', ')}`,
            });
        }
    }

    // 3. Framework-specific required files
    const required = FRAMEWORK_REQUIRED_FILES[framework];
    if (required) {
        for (const req of required) {
            const hasFile = files.some(f => (f.path || f).includes(req.pattern));
            if (!hasFile) {
                errors.push({
                    type: 'MISSING_FILE',
                    message: req.message,
                });
            }
        }
    }

    // 4. No duplicate paths
    const pathSet = new Set();
    for (const file of files) {
        const p = file.path || file;
        if (pathSet.has(p)) {
            errors.push({
                type: 'DUPLICATE_FILE',
                message: `Duplicate file path: ${p}`,
            });
        }
        pathSet.add(p);
    }

    // 5. All paths are valid (no absolute paths, no ..)
    for (const file of files) {
        const p = file.path || file;
        if (p.startsWith('/') || p.includes('..')) {
            errors.push({
                type: 'INVALID_PATH',
                message: `Invalid file path: ${p}`,
            });
        }
    }

    // 6. Package.json should exist for framework projects
    if (framework !== 'vanilla-js') {
        const hasPkg = files.some(f => (f.path || f) === 'package.json');
        if (!hasPkg) {
            warnings.push({
                type: 'MISSING_FILE',
                message: 'No package.json in plan — will use template',
            });
        }
    }

    // 7. Circular dependencies (DAG required for topological generation order)
    const pathStrings = files.map(f => f.path || f);
    const depGraph = buildDependencyGraph(files, plan.imports || {});
    const cycles = detectCycles(pathStrings, depGraph);
    if (cycles.length > 0) {
        errors.push({
            type: 'CIRCULAR_DEPENDENCY',
            field: 'files',
            message: `Circular dependencies detected: ${cycles.map(c => c.join(' → ')).join('; ')}`,
            cycles,
        });
    }

    // 8. Sort files by dependency order (mutates plan when valid)
    if (errors.length === 0) {
        const sortedPaths = sortFilesByDependency(plan);
        reorderPlanFiles(plan, sortedPaths);
        plan._sortedByDependency = true;
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

export { FILE_COUNT_BOUNDS, FRAMEWORK_ENTRY_POINTS };
