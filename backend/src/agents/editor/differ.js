// ═══════════════════════════════════════════════════════════════════════════════
// Change Impact Analyzer — determines which files are affected by an edit
// ═══════════════════════════════════════════════════════════════════════════════

import { extractContracts } from '../shared/contracts.js';

/**
 * Analyzes the impact of a file change across the project.
 */
export class ChangeImpactAnalyzer {
    /**
     * Determine which files need updating after a change to one file.
     *
     * @param {string} changedPath - Path of the changed file
     * @param {string} oldContent - Previous content
     * @param {string} newContent - New content after edit
     * @param {import('../shared/memory.js').ProjectMemory} memory
     * @returns {{ directlyAffected: Array, maybeAffected: Array, contractBreaking: boolean }}
     */
    analyzeImpact(changedPath, oldContent, newContent, memory) {
        const oldContracts = extractContracts(oldContent, changedPath);
        const newContracts = extractContracts(newContent, changedPath);

        const impact = {
            directlyAffected: [],
            maybeAffected: [],
            contractBreaking: false,
        };

        // Check if exports changed
        const removedExports = (oldContracts.exports || []).filter(
            e => !(newContracts.exports || []).includes(e)
        );
        const renamedDefault = oldContracts.defaultExport &&
            newContracts.defaultExport &&
            oldContracts.defaultExport !== newContracts.defaultExport;

        if (removedExports.length > 0 || renamedDefault) {
            impact.contractBreaking = true;

            // Find all files that import from the changed file
            const dependents = memory.getDependents(changedPath);
            for (const depPath of dependents) {
                const record = memory.getFile(depPath);
                if (!record?.content) continue;

                const reason = renamedDefault
                    ? `Default export renamed from ${oldContracts.defaultExport} to ${newContracts.defaultExport}`
                    : `Removed exports: ${removedExports.join(', ')}`;

                impact.directlyAffected.push({
                    path: depPath,
                    reason,
                    action: 'fix',
                });
            }
        }

        // Check if props changed (for components)
        if (oldContracts.props && newContracts.props) {
            const removedProps = oldContracts.props.filter(
                p => !(newContracts.props || []).includes(p)
            );

            if (removedProps.length > 0) {
                const componentName = newContracts.defaultExport || changedPath;

                for (const [path, record] of memory.files) {
                    if (path === changedPath || !record.content) continue;
                    // Check if this file renders the changed component
                    if (record.content.includes(`<${componentName}`)) {
                        impact.directlyAffected.push({
                            path,
                            reason: `Passes removed props: ${removedProps.join(', ')}`,
                            action: 'fix',
                        });
                    }
                }
            }
        }

        // Check if imports changed — new imports may need to be created
        const addedImports = (newContracts.imports || []).filter(
            i => !(oldContracts.imports || []).includes(i)
        );
        for (const imp of addedImports) {
            if (!imp.startsWith('.')) continue;
            const resolved = memory.resolveImport(changedPath, imp);
            if (!resolved) {
                impact.maybeAffected.push({
                    path: imp,
                    reason: `New import "${imp}" does not resolve to an existing file`,
                    action: 'create',
                });
            }
        }

        // Deduplicate
        const seen = new Set();
        impact.directlyAffected = impact.directlyAffected.filter(a => {
            if (seen.has(a.path)) return false;
            seen.add(a.path);
            return true;
        });

        return impact;
    }

    /**
     * Identify which files are affected by a natural language refinement prompt.
     * Uses simple keyword matching against file purposes and content.
     *
     * @param {string} refinementPrompt - User's edit instruction
     * @param {import('../shared/memory.js').ProjectMemory} memory
     * @returns {string[]} Affected file paths
     */
    identifyAffectedByPrompt(refinementPrompt, memory) {
        const prompt = refinementPrompt.toLowerCase();
        const affected = [];

        for (const [filePath, record] of memory.files) {
            if (!record.content) continue;

            let score = 0;

            // Check purpose match
            if (record.purpose) {
                const purpose = record.purpose.toLowerCase();
                const words = prompt.split(/\s+/);
                for (const word of words) {
                    if (word.length > 3 && purpose.includes(word)) score += 2;
                }
            }

            // Check filename match
            const filename = filePath.toLowerCase();
            const promptWords = prompt.split(/\s+/).filter(w => w.length > 3);
            for (const word of promptWords) {
                if (filename.includes(word)) score += 3;
            }

            // Common section keywords
            const sectionKeywords = {
                hero: ['hero', 'banner', 'header'],
                footer: ['footer', 'bottom'],
                nav: ['nav', 'navbar', 'navigation', 'menu'],
                pricing: ['pricing', 'price', 'plan'],
                form: ['form', 'contact', 'input'],
                auth: ['auth', 'login', 'signup', 'register'],
                style: ['style', 'css', 'color', 'theme', 'dark', 'light', 'font', 'animation'],
            };

            const isStyleFile = filename.endsWith('.css') || filename.endsWith('.scss');

            for (const [category, keywords] of Object.entries(sectionKeywords)) {
                for (const kw of keywords) {
                    if (prompt.includes(kw)) {
                        if (filename.includes(kw) || record.purpose?.toLowerCase().includes(kw)) {
                            score += 5;
                        }
                        // Style-related keywords match any CSS file
                        if (category === 'style' && isStyleFile) {
                            score += 5;
                        }
                    }
                }
            }

            if (score > 2) {
                affected.push({ path: filePath, score });
            }
        }

        // Sort by relevance and return paths
        return affected.sort((a, b) => b.score - a.score).map(a => a.path);
    }
}
