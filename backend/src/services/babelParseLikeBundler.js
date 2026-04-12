/**
 * Parse JS/TS/TSX the same way the preview bundler does, so validation matches
 * Babel errors users see in Live Preview (duplicate identifiers, etc.).
 */
import babel from '@babel/core';
import presetReact from '@babel/preset-react';
import presetTypescript from '@babel/preset-typescript';
import presetEnv from '@babel/preset-env';

function sanitizeCode(code) {
    return code
        .replace(/^\uFEFF/, '')
        .replace(/[\u200B-\u200D\uFEFF\u2028\u2029]/g, '');
}

/**
 * @param {string} code
 * @param {string} filename - virtual path (e.g. src/App.tsx)
 * @returns {{ ok: boolean, error: string | null }}
 */
export function parseLikeBundler(code, filename) {
    if (!code || typeof code !== 'string') {
        return { ok: true, error: null };
    }
    const sanitized = sanitizeCode(code);
    const isTypescript = filename.endsWith('.tsx') || filename.endsWith('.ts');

    function runParse(withTsPreset) {
        return babel.parseSync(sanitized, {
            presets: [
                [presetEnv, { targets: 'last 2 Chrome versions', modules: false }],
                [presetReact, { runtime: 'classic' }],
                withTsPreset ? [presetTypescript, { isTSX: filename.endsWith('.tsx'), allExtensions: true }] : null,
            ].filter(Boolean),
            filename,
            sourceType: 'module',
            configFile: false,
            babelrc: false,
        });
    }

    try {
        runParse(isTypescript);
        return { ok: true, error: null };
    } catch (firstError) {
        if (!isTypescript) {
            try {
                runParse(true);
                return { ok: true, error: null };
            } catch {
                /* use firstError */
            }
        }
        const msg = firstError?.message || String(firstError);
        return { ok: false, error: msg };
    }
}
