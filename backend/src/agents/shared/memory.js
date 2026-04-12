import path from 'path';
import { extractContracts } from './contracts.js';
import { classifyLayer } from '../planner/dependencyGraph.js';

/**
 * Shared project memory — single source of truth for all agents.
 * Stores file records, dependency graph, contracts, design system, errors, and decisions.
 */
export class ProjectMemory {
    constructor() {
        this.files = new Map();           // path → FileRecord
        this.dependencyGraph = new Map(); // path → Set<path> (what this file imports)
        this.reverseGraph = new Map();    // path → Set<path> (what imports this file)
        this.contracts = new Map();       // path → extracted contracts
        this.designSystem = null;
        this.errors = [];
        this.decisions = [];
        /** @type {Record<string, unknown>} */
        this.interfaceManifest = {};
        /** @type {string[]} */
        this.generationOrder = [];
        /** @type {Record<string, unknown>} */
        this.generatedContracts = {};
    }

    setInterfaceManifest(manifest) {
        this.interfaceManifest = manifest || {};
    }

    getManifestEntry(filePath) {
        return this.interfaceManifest[filePath] || null;
    }

    setGenerationOrder(files) {
        this.generationOrder = Array.isArray(files) ? [...files] : [];
    }

    /**
     * Files likely imported before this file (layer heuristic) — used for context tiering.
     */
    getDirectDependencies(filePath) {
        const fileLayer = classifyLayer(filePath);
        return this.generationOrder.filter(f => {
            const depLayer = classifyLayer(f);
            return depLayer < fileLayer && depLayer >= 0;
        });
    }

    recordGeneratedContract(filePath, contract) {
        this.generatedContracts[filePath] = contract;
    }

    getGeneratedContract(filePath) {
        return this.generatedContracts[filePath] || null;
    }

    /**
     * Register a planned file (before generation).
     */
    addPlannedFile(filePath, purpose) {
        this.files.set(filePath, {
            path: filePath,
            content: null,
            status: 'planned',
            purpose,
            validation: null,
            contracts: { exports: [], defaultExport: null, imports: [], props: null },
            generationAttempts: 0,
            tokens: { prompt: 0, completion: 0 },
        });
    }

    /**
     * Update a file record after generation.
     */
    setFileGenerated(filePath, content, validation = null) {
        const existing = this.files.get(filePath) || {};
        const contracts = extractContracts(content, filePath);

        this.files.set(filePath, {
            ...existing,
            path: filePath,
            content,
            status: validation?.isValid === false ? 'invalid' : 'generated',
            validation,
            contracts,
            generationAttempts: (existing.generationAttempts || 0) + 1,
        });

        this.contracts.set(filePath, contracts);
        this._rebuildDependencies(filePath, contracts);
    }

    /**
     * Mark file as fixed.
     */
    setFileFixed(filePath, content, validation) {
        const existing = this.files.get(filePath) || {};
        const contracts = extractContracts(content, filePath);

        this.files.set(filePath, {
            ...existing,
            path: filePath,
            content,
            status: 'fixed',
            validation,
            contracts,
        });

        this.contracts.set(filePath, contracts);
        this._rebuildDependencies(filePath, contracts);
    }

    /**
     * Mark file as failed.
     */
    setFileFailed(filePath, error) {
        const existing = this.files.get(filePath) || {};
        this.files.set(filePath, {
            ...existing,
            path: filePath,
            status: 'failed',
            validation: { isValid: false, errors: [error] },
        });
    }

    /**
     * Mark a file as currently generating (streaming).
     */
    setFileGenerating(filePath) {
        const existing = this.files.get(filePath) || {};
        this.files.set(filePath, {
            ...existing,
            path: filePath,
            status: 'generating',
        });
    }

    /**
     * Get all files that this file imports from (direct dependencies).
     */
    getDependencies(filePath) {
        return [...(this.dependencyGraph.get(filePath) || [])];
    }

    /**
     * Get all files that import from this file (reverse dependencies / dependents).
     */
    getDependents(filePath) {
        return [...(this.reverseGraph.get(filePath) || [])];
    }

    /**
     * Get contracts for a specific file.
     */
    getContracts(filePath) {
        return this.contracts.get(filePath) || null;
    }

    /**
     * Update contracts for a file without full regeneration.
     */
    updateContracts(filePath, contracts) {
        this.contracts.set(filePath, contracts);
        const record = this.files.get(filePath);
        if (record) {
            record.contracts = contracts;
            this._rebuildDependencies(filePath, contracts);
        }
    }

    /**
     * Get a flat object of all generated file contents (for backward compat).
     */
    getGeneratedFiles() {
        const result = {};
        for (const [p, record] of this.files) {
            if (record.content) result[p] = record.content;
        }
        return result;
    }

    /**
     * Get file record.
     */
    getFile(filePath) {
        return this.files.get(filePath) || null;
    }

    /**
     * Get all files with a given status.
     */
    getFilesByStatus(status) {
        return [...this.files.values()].filter(f => f.status === status);
    }

    /**
     * Get count of files by status.
     */
    getStatusCounts() {
        const counts = { planned: 0, generating: 0, generated: 0, invalid: 0, fixed: 0, failed: 0 };
        for (const record of this.files.values()) {
            if (record.status in counts) counts[record.status]++;
        }
        return counts;
    }

    /**
     * Add a classified error.
     */
    addError(error) {
        this.errors.push({ ...error, timestamp: Date.now() });
    }

    /**
     * Add an agent decision to the audit trail.
     */
    addDecision(agent, action, reason, metadata = {}) {
        this.decisions.push({ agent, action, reason, ...metadata, timestamp: Date.now() });
    }

    /**
     * Set the shared design system tokens.
     */
    setDesignSystem(designSystem) {
        this.designSystem = designSystem;
    }

    /**
     * Resolve a relative import path to an absolute project path.
     */
    resolveImport(fromFile, importPath) {
        if (!importPath.startsWith('.')) return null; // external package

        const fromDir = path.dirname(fromFile);
        let resolved = path.posix.join(fromDir, importPath);

        // Try common extensions
        const extensions = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.css', '.scss'];

        if (this.files.has(resolved)) return resolved;
        for (const ext of extensions) {
            if (this.files.has(resolved + ext)) return resolved + ext;
        }
        // Try index files
        for (const ext of extensions) {
            const indexPath = path.posix.join(resolved, 'index' + ext);
            if (this.files.has(indexPath)) return indexPath;
        }

        return null;
    }

    /**
     * Rebuild dependency graph edges for a file based on its contracts.
     */
    _rebuildDependencies(filePath, contracts) {
        // Clear old edges for this file
        const oldDeps = this.dependencyGraph.get(filePath);
        if (oldDeps) {
            for (const dep of oldDeps) {
                const reverse = this.reverseGraph.get(dep);
                if (reverse) reverse.delete(filePath);
            }
        }

        const newDeps = new Set();
        for (const imp of (contracts.imports || [])) {
            const resolved = this.resolveImport(filePath, imp);
            if (resolved) {
                newDeps.add(resolved);
                if (!this.reverseGraph.has(resolved)) {
                    this.reverseGraph.set(resolved, new Set());
                }
                this.reverseGraph.get(resolved).add(filePath);
            }
        }
        this.dependencyGraph.set(filePath, newDeps);
    }

    /**
     * Serialize to plain object for debugging/logging.
     */
    toJSON() {
        const files = {};
        for (const [p, r] of this.files) {
            files[p] = { status: r.status, contracts: r.contracts, validation: r.validation ? { isValid: r.validation.isValid } : null };
        }
        return {
            fileCount: this.files.size,
            files,
            errorCount: this.errors.length,
            decisionCount: this.decisions.length,
        };
    }
}
