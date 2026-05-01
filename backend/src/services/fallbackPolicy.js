// ═══════════════════════════════════════════════════════════════════════════════
// File-level fallback policy.
//
// Phase A philosophy:
//   • INFRA files  (configs, lockfiles, package.json, vite.config, etc.) — silent
//     template fallback is acceptable. The user never opens these directly and a
//     generic version usually works fine.
//   • USER_FACING files (components, pages, services, hooks, app entry, css) —
//     silent template fallback is NOT acceptable. The user will look at these.
//     If the LLM can't produce them, fail loud so the user gets a real error
//     and the chance to retry / rephrase rather than ship a fake-looking project.
//
// Classification is intentionally simple — pattern-based on the file path. When
// in doubt, treat as USER_FACING (stricter is safer than silently shipping a stub).
// ═══════════════════════════════════════════════════════════════════════════════

import path from 'node:path';

export const FILE_ROLE = Object.freeze({
    INFRA: 'infra',
    USER_FACING: 'user_facing',
});

// Exact paths that are always infra
const INFRA_EXACT = new Set([
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'tsconfig.json',
    'tsconfig.node.json',
    'tsconfig.app.json',
    'jsconfig.json',
    '.gitignore',
    '.npmrc',
    '.nvmrc',
    'README.md',
]);

// Path patterns that classify as infra
const INFRA_PATTERNS = [
    /(^|\/)vite\.config\.(js|ts|mjs|cjs)$/,
    /(^|\/)next\.config\.(js|ts|mjs|cjs)$/,
    /(^|\/)astro\.config\.(js|ts|mjs)$/,
    /(^|\/)svelte\.config\.(js|ts)$/,
    /(^|\/)nuxt\.config\.(js|ts)$/,
    /(^|\/)tailwind\.config\.(js|ts|cjs)$/,
    /(^|\/)postcss\.config\.(js|ts|cjs)$/,
    /(^|\/)babel\.config\.(js|ts|json)$/,
    /(^|\/)\.babelrc(\.json)?$/,
    /(^|\/)\.eslintrc(\.cjs|\.js|\.json|\.yml)?$/,
    /(^|\/)\.prettierrc(\.json|\.js|\.yml)?$/,
    /(^|\/)angular\.json$/,
    /(^|\/)nx\.json$/,
];

// User-facing patterns that should ALWAYS be user-facing even if extension matches infra defaults
const USER_FACING_PATTERNS = [
    /(^|\/)src\/.+\.(jsx|tsx|vue|svelte|astro)$/,
    /(^|\/)app\/.+\.(jsx|tsx|vue|svelte|astro)$/,
    /(^|\/)pages\/.+\.(jsx|tsx|vue|svelte|astro)$/,
    /(^|\/)components\/.+\.(jsx|tsx|vue|svelte|astro)$/,
    /(^|\/)layouts\/.+\.(jsx|tsx|vue|svelte|astro)$/,
    /(^|\/)hooks\/.+\.(js|jsx|ts|tsx)$/,
    /(^|\/)services\/.+\.(js|jsx|ts|tsx)$/,
    /(^|\/)stores?\/.+\.(js|jsx|ts|tsx)$/,
    /(^|\/)contexts?\/.+\.(js|jsx|ts|tsx)$/,
    /(^|\/)utils?\/.+\.(js|jsx|ts|tsx)$/,
    /(^|\/)lib\/.+\.(js|jsx|ts|tsx)$/,
    /(^|\/)App\.(jsx|tsx|vue|svelte)$/,
    /(^|\/)main\.(jsx|tsx|js|ts)$/,
    /(^|\/)index\.(jsx|tsx|html)$/,
    /(^|\/)page\.(jsx|tsx)$/,
    /(^|\/)layout\.(jsx|tsx)$/,
    /\.module\.(css|scss)$/,
];

/**
 * Classify a file path as infra or user-facing.
 *
 * @param {string} filePath - Project-relative file path.
 * @returns {'infra' | 'user_facing'}
 */
export function classifyFile(filePath) {
    if (!filePath || typeof filePath !== 'string') return FILE_ROLE.USER_FACING;

    const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
    const basename = path.basename(normalized);

    if (INFRA_EXACT.has(basename) || INFRA_EXACT.has(normalized)) return FILE_ROLE.INFRA;

    for (const re of INFRA_PATTERNS) {
        if (re.test(normalized)) return FILE_ROLE.INFRA;
    }

    // CSS / global stylesheet at the top level of src/ or app/ → infra-ish (template
    // suffices when LLM fails). Component-scoped *.module.css remains user-facing.
    if (
        /(^|\/)(index|globals?|styles?|app|main|reset)\.(css|scss)$/.test(normalized)
        && !/\.module\.(css|scss)$/.test(normalized)
    ) {
        return FILE_ROLE.INFRA;
    }

    for (const re of USER_FACING_PATTERNS) {
        if (re.test(normalized)) return FILE_ROLE.USER_FACING;
    }

    // Unknown — default to user_facing (safer to fail loud than silently ship a stub).
    return FILE_ROLE.USER_FACING;
}

/**
 * Should we use a deterministic template as a silent fallback for this file
 * when LLM generation fails? Only true for INFRA files.
 *
 * @param {string} filePath
 */
export function allowSilentTemplate(filePath) {
    return classifyFile(filePath) === FILE_ROLE.INFRA;
}

/**
 * Build a user-facing error describing why a file couldn't be generated.
 * Used when fail-loud applies.
 *
 * @param {string} filePath
 * @param {string} reason
 */
export function fileGenerationError(filePath, reason) {
    const err = new Error(
        `Could not generate ${filePath}: ${reason}. ` +
        `This file is part of the user-facing project; falling back to a generic template ` +
        `would ship a misleading project. Please retry, rephrase your prompt, or simplify the request.`
    );
    err.code = 'FILE_GENERATION_FAILED';
    err.filePath = filePath;
    err.reason = reason;
    return err;
}
