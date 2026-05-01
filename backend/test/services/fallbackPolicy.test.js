import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    classifyFile,
    allowSilentTemplate,
    fileGenerationError,
    FILE_ROLE,
} from '../../src/services/fallbackPolicy.js';

describe('classifyFile — INFRA', () => {
    const infraCases = [
        'package.json',
        'package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml',
        'tsconfig.json',
        'tsconfig.node.json',
        'vite.config.ts',
        'vite.config.js',
        'next.config.js',
        'tailwind.config.js',
        'postcss.config.cjs',
        'astro.config.mjs',
        'svelte.config.js',
        'angular.json',
        '.gitignore',
        'README.md',
        'src/index.css',
        'src/app.css',
        'src/styles.css',
        'app/globals.css',
        'src/main.css',
    ];
    for (const path of infraCases) {
        it(`classifies ${path} as INFRA`, () => {
            assert.strictEqual(classifyFile(path), FILE_ROLE.INFRA);
            assert.strictEqual(allowSilentTemplate(path), true);
        });
    }
});

describe('classifyFile — USER_FACING', () => {
    const userFacingCases = [
        'src/App.tsx',
        'src/App.jsx',
        'src/main.tsx',
        'src/components/TaskList.tsx',
        'src/components/ui/Button.tsx',
        'src/pages/Home.jsx',
        'src/pages/[id].tsx',
        'src/hooks/useTasks.ts',
        'src/services/api.ts',
        'src/store/tasks.ts',
        'src/contexts/Theme.tsx',
        'src/utils/format.ts',
        'src/lib/cn.ts',
        'app/page.tsx',
        'app/layout.tsx',
        'src/components/Card.module.css',
        'src/App.vue',
        'src/App.svelte',
    ];
    for (const path of userFacingCases) {
        it(`classifies ${path} as USER_FACING`, () => {
            assert.strictEqual(classifyFile(path), FILE_ROLE.USER_FACING);
            assert.strictEqual(allowSilentTemplate(path), false);
        });
    }
});

describe('classifyFile — defaults to USER_FACING when unknown', () => {
    it('unknown random path is user_facing', () => {
        assert.strictEqual(classifyFile('weird/random/file.xyz'), FILE_ROLE.USER_FACING);
    });

    it('handles empty / null', () => {
        assert.strictEqual(classifyFile(''), FILE_ROLE.USER_FACING);
        assert.strictEqual(classifyFile(null), FILE_ROLE.USER_FACING);
        assert.strictEqual(classifyFile(undefined), FILE_ROLE.USER_FACING);
    });

    it('module CSS for component is user-facing (not generic global CSS)', () => {
        assert.strictEqual(classifyFile('src/components/Foo.module.css'), FILE_ROLE.USER_FACING);
    });

    it('global CSS at top level is infra', () => {
        assert.strictEqual(classifyFile('src/index.css'), FILE_ROLE.INFRA);
    });
});

describe('classifyFile — path normalization', () => {
    it('normalizes Windows-style backslashes', () => {
        assert.strictEqual(classifyFile('src\\components\\Header.tsx'), FILE_ROLE.USER_FACING);
    });

    it('strips leading ./', () => {
        assert.strictEqual(classifyFile('./package.json'), FILE_ROLE.INFRA);
    });
});

describe('fileGenerationError', () => {
    it('produces a typed error with code FILE_GENERATION_FAILED', () => {
        const err = fileGenerationError('src/App.tsx', 'unbalanced JSX');
        assert.strictEqual(err.code, 'FILE_GENERATION_FAILED');
        assert.strictEqual(err.filePath, 'src/App.tsx');
        assert.strictEqual(err.reason, 'unbalanced JSX');
        assert.match(err.message, /Could not generate src\/App\.tsx/);
        assert.match(err.message, /unbalanced JSX/);
    });
});
