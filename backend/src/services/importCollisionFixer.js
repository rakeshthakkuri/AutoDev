/**
 * Deterministic fix for duplicate import bindings (common LLM mistake).
 * Example: `Menu` from both `lucide-react` and `@headlessui/react` → Babel "already been declared".
 * Aliasing the lucide import removes the duplicate. Icon JSX should use `LucideMenu` — callers may run
 * a follow-up fix pass; fixing imports alone resolves the parse-time duplicate identifier error.
 */

/**
 * @param {string} code
 * @returns {string}
 */
export function fixKnownImportCollisions(code) {
    if (!code || typeof code !== 'string') return code;
    if (!code.includes('lucide-react') || !code.includes('@headlessui/react')) return code;

    const lucideMenu = /import\s*\{[^}]*\bMenu\b[^}]*\}\s*from\s*['"]lucide-react['"]/.test(code);
    const headlessMenu = /import\s*\{[^}]*\bMenu\b[^}]*\}\s*from\s*['"]@headlessui\/react['"]/.test(code);
    if (!lucideMenu || !headlessMenu) return code;

    return code.replace(
        /import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/,
        (full, inner) => {
            if (!/\bMenu\b/.test(inner) || /\bMenu\s+as\s+\w+/.test(inner)) return full;
            const next = inner.replace(/\bMenu\b/, 'Menu as LucideMenu');
            return `import { ${next} } from 'lucide-react'`;
        }
    );
}
