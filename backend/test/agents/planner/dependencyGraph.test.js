import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    classifyLayer,
    sortFilesByDependency,
    detectCycles,
} from '../../../src/agents/planner/dependencyGraph.js';
import { validatePlan } from '../../../src/agents/planner/validators.js';

describe('dependencyGraph', () => {
    it('classifies layers for typical paths', () => {
        assert.ok(classifyLayer('src/utils/format.js') < classifyLayer('src/components/Button.jsx'));
        assert.ok(classifyLayer('src/components/Button.jsx') < classifyLayer('src/pages/Home.jsx'));
        assert.strictEqual(classifyLayer('src/App.jsx'), 7);
    });

    it('sortFilesByDependency orders leaves before entry', () => {
        const plan = {
            files: [
                'src/App.jsx',
                'src/pages/Home.jsx',
                'src/components/Button.jsx',
                'src/hooks/useAuth.js',
                'src/utils/api.js',
                'src/services/userService.js',
                'package.json',
                'index.html',
            ],
        };
        const sorted = sortFilesByDependency(plan);
        const idx = (f) => sorted.indexOf(f);
        assert.ok(idx('src/utils/api.js') < idx('src/hooks/useAuth.js'));
        assert.ok(idx('src/hooks/useAuth.js') < idx('src/components/Button.jsx'));
        assert.ok(idx('src/components/Button.jsx') < idx('src/pages/Home.jsx'));
        assert.ok(idx('src/pages/Home.jsx') < idx('src/App.jsx'));
    });

    it('detectCycles finds mutual explicit dependency', () => {
        const graph = { 'a.js': ['b.js'], 'b.js': ['a.js'] };
        const cycles = detectCycles(['a.js', 'b.js'], graph);
        assert.ok(cycles.length > 0);
    });

    it('validatePlan sorts files and sets flag', () => {
        const plan = {
            files: [
                { path: 'src/App.jsx', purpose: 'app' },
                { path: 'src/pages/Home.jsx', purpose: 'page' },
                { path: 'src/components/Button.jsx', purpose: 'ui' },
                { path: 'src/hooks/useTheme.js', purpose: 'hook' },
                { path: 'src/utils/cn.js', purpose: 'util' },
                { path: 'index.html', purpose: 'html' },
                { path: 'package.json', purpose: 'pkg' },
            ],
            techStack: { framework: 'react' },
            designSystem: { colors: {}, typography: {} },
        };
        const requirements = { framework: 'react', complexity: 'intermediate', projectType: 'web app' };
        const result = validatePlan(plan, requirements);
        assert.strictEqual(result.valid, true, JSON.stringify(result.errors));
        const paths = plan.files.map(f => f.path);
        assert.strictEqual(plan._sortedByDependency, true);
        assert.ok(paths.indexOf('src/utils/cn.js') < paths.indexOf('src/hooks/useTheme.js'));
        assert.ok(paths.indexOf('src/hooks/useTheme.js') < paths.indexOf('src/components/Button.jsx'));
        assert.ok(paths.indexOf('src/components/Button.jsx') < paths.indexOf('src/pages/Home.jsx'));
        assert.ok(paths.indexOf('src/pages/Home.jsx') < paths.indexOf('src/App.jsx'));
    });
});
