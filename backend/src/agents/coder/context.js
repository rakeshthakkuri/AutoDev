import path from 'path';
import { formatContractCompact, formatContractFull, compressContract } from '../shared/contracts.js';
import { formatManifestForPrompt } from '../planner/interfaceManifest.js';

/**
 * Dependency-aware context builder.
 * Replaces the old buildContextPrompt with tiered, token-budget-aware context assembly.
 */
export class ContextBuilder {
    /**
     * @param {import('../shared/memory.js').ProjectMemory} memory
     */
    constructor(memory) {
        this.memory = memory;
    }

    /**
     * Build context for generating a specific file.
     * Returns a structured prompt section with tiered priority.
     *
     * @param {string} targetPath - File being generated
     * @param {number} tokenBudget - Max tokens for context (default 4000)
     * @returns {string} Formatted context string for the LLM prompt
     */
    buildContext(targetPath, tokenBudget = 4000) {
        const sections = [];
        let tokensUsed = 0;

        // Manifest (interface lock) + dependency interfaces
        const manifest = this.memory?.interfaceManifest || {};
        const genOrder = this.memory?.generationOrder || [];
        const idx = genOrder.indexOf(targetPath);
        const preceding = idx > 0 ? genOrder.slice(0, idx) : [];
        const manifestSection = formatManifestForPrompt(manifest, targetPath, preceding);
        if (manifestSection) {
            const cost = this._estimateTokens(manifestSection);
            if (tokensUsed + cost <= tokenBudget * 0.35) {
                sections.push({ priority: 0, content: manifestSection });
                tokensUsed += cost;
            }
        }

        // TIER 1: Direct dependencies (files this file MUST import from)
        // These get full contracts + abbreviated content
        const directDeps = this.memory.getDependencies(targetPath);
        // Also check plan-level dependencies from file purposes
        const plannedDeps = this._inferDependenciesFromPlan(targetPath);
        const allDeps = [...new Set([...directDeps, ...plannedDeps])];

        for (const depPath of allDeps) {
            const record = this.memory.getFile(depPath);
            if (!record?.content) continue;

            const contract = formatContractFull(record);
            const cost = this._estimateTokens(contract);
            if (tokensUsed + cost > tokenBudget * 0.5) break;

            sections.push({
                priority: 1,
                content: `### ${depPath} (dependency)\n${contract}`,
            });
            tokensUsed += cost;
        }

        // TIER 2: Files that import THIS file (reverse deps / consumers)
        // Only contracts, so we know what interface to expose
        const dependents = this.memory.getDependents(targetPath);
        for (const depPath of dependents) {
            const record = this.memory.getFile(depPath);
            if (!record?.contracts) continue;

            const importsFromTarget = (record.contracts.imports || [])
                .filter(i => this.memory.resolveImport(depPath, i) === targetPath);
            if (importsFromTarget.length === 0) continue;

            const summary = `// Used by: ${depPath} — imports: ${importsFromTarget.join(', ')}`;
            const cost = this._estimateTokens(summary);
            if (tokensUsed + cost > tokenBudget * 0.7) break;

            sections.push({
                priority: 2,
                content: summary,
            });
            tokensUsed += cost;
        }

        // TIER 3: Design system tokens (always included, compact)
        if (this.memory.designSystem) {
            const dsStr = `### Design System\n\`\`\`json\n${JSON.stringify(this.memory.designSystem, null, 2)}\n\`\`\``;
            const cost = this._estimateTokens(dsStr);
            if (tokensUsed + cost <= tokenBudget * 0.85) {
                sections.push({ priority: 3, content: dsStr });
                tokensUsed += cost;
            }
        }

        // TIER 4: Sibling files in same directory (contracts only)
        const dir = path.dirname(targetPath);
        const siblings = [...this.memory.files.entries()]
            .filter(([p]) => path.dirname(p) === dir && p !== targetPath);

        for (const [sibPath, record] of siblings) {
            if (tokensUsed > tokenBudget * 0.92) break;
            if (!record.contracts) continue;
            const contract = formatContractCompact(record.contracts);
            const line = `// Sibling: ${sibPath} — ${contract}`;
            sections.push({ priority: 4, content: line });
            tokensUsed += this._estimateTokens(line);
        }

        // TIER 5: Compressed summaries for other generated files (two-tier context)
        const allGenerated = this.memory.getGeneratedFiles();
        const tier1Paths = new Set();
        for (const s of sections) {
            const m = s.content?.match(/^### ([^\n]+)/m);
            if (m) tier1Paths.add(m[1].replace(' (dependency)', '').trim());
        }
        const compressedLines = ['## Other generated files (compressed — match exports only; do not duplicate):'];
        let added = 0;
        for (const [p, code] of Object.entries(allGenerated)) {
            if (p === targetPath) continue;
            if (tier1Paths.has(p)) continue;
            if (this.memory.getDependencies(targetPath).includes(p)) continue;
            compressedLines.push(`- ${compressContract(p, code)}`);
            added++;
            if (added >= 25 || tokensUsed > tokenBudget * 0.95) break;
        }
        if (added > 0) {
            const block = compressedLines.join('\n');
            sections.push({ priority: 5, content: block });
        }

        if (sections.length === 0) return '';

        const sorted = sections.sort((a, b) => a.priority - b.priority);
        return '\nPROJECT CONTEXT (reference for consistency — match imports, exports, props):\n' +
            sorted.map(s => s.content).join('\n\n') + '\n';
    }

    /**
     * Infer dependencies from plan-level file purposes (before files are generated).
     * E.g., if a Hero.jsx's purpose mentions "used by App.jsx", add App as a reverse dep.
     */
    _inferDependenciesFromPlan(targetPath) {
        const deps = [];
        const targetDir = path.dirname(targetPath);

        for (const [p, record] of this.memory.files) {
            if (p === targetPath) continue;
            if (record.status !== 'generated' && record.status !== 'fixed') continue;

            // Check if in same directory or parent
            const pDir = path.dirname(p);
            if (pDir === targetDir || targetPath.startsWith(pDir + '/')) {
                deps.push(p);
            }
        }

        // Prioritize config files and styles
        return deps.sort((a, b) => {
            const aConfig = a.includes('config') || a.includes('package.json') || a.includes('tsconfig');
            const bConfig = b.includes('config') || b.includes('package.json') || b.includes('tsconfig');
            const aStyle = a.endsWith('.css') || a.endsWith('.scss');
            const bStyle = b.endsWith('.css') || b.endsWith('.scss');
            if (aConfig && !bConfig) return -1;
            if (!aConfig && bConfig) return 1;
            if (aStyle && !bStyle) return -1;
            if (!aStyle && bStyle) return 1;
            return 0;
        });
    }

    /**
     * Rough token estimate (chars / 3.5 for English text + code).
     */
    _estimateTokens(text) {
        return Math.ceil((text || '').length / 3.5);
    }
}

/**
 * Adaptive token budget calculator.
 * Replaces the static table in llm.js with dependency-aware scaling.
 */
export function calculateTokenBudget(filePath, complexity, memory) {
    const ext = path.extname(filePath).toLowerCase();
    const isAdvanced = complexity === 'advanced';

    const baseBudgets = {
        config: 1536,
        style: 3072,
        component: 4096,
        page: 6144,
        layout: 4096,
        utility: 2048,
        entry: 3072,
    };

    // Classify file type
    let type = 'component';
    if (['.json', '.mjs', '.cjs'].includes(ext) || filePath.includes('config') || filePath.includes('tsconfig')) {
        type = 'config';
    } else if (['.css', '.scss'].includes(ext)) {
        type = 'style';
    } else if (filePath.includes('App.') || filePath.includes('page.') || filePath.includes('index.html')) {
        type = 'page';
    } else if (filePath.includes('layout')) {
        type = 'layout';
    } else if (filePath.includes('main.') || filePath.includes('index.')) {
        type = 'entry';
    } else if (filePath.includes('util') || filePath.includes('helper') || filePath.includes('lib/')) {
        type = 'utility';
    }

    let budget = baseBudgets[type] || 4096;

    // Scale up for advanced complexity
    if (isAdvanced && type !== 'config') {
        budget = Math.min(budget * 1.5, 8192);
    }

    // Scale up for files with many dependents (they're more critical)
    if (memory) {
        const dependentCount = memory.getDependents(filePath).length;
        if (dependentCount > 3) {
            budget = Math.min(budget * 1.3, 8192);
        }
    }

    return Math.round(budget);
}
