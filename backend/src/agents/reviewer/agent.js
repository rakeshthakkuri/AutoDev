import logger from '../../services/logger.js';
import { createError, classifyIssues, attributeRootCauses } from '../shared/errors.js';
import { collectBundlerTransformErrors } from '../../services/bundler.js';

/**
 * Reviewer Agent — validates project-level consistency with multiple passes.
 * Replaces the single validate_project tool with structured, multi-pass review.
 */
export class ReviewerAgent {
    /**
     * @param {{ validator: import('../../services/validator.js').CodeValidator }} services
     */
    constructor(services) {
        this.validator = services.validator;
    }

    /**
     * Run multi-pass review of the entire project.
     * Returns state delta with reviewResult.
     */
    async reviewProject(state) {
        const { memory, requirements } = state;
        const framework = requirements?.framework || 'react';

        logger.info('[ReviewerAgent] Starting project review');

        const allIssues = [];

        // Pass 1: Structural integrity
        const structuralIssues = this._checkStructure(memory, framework);
        allIssues.push(...structuralIssues);

        // Pass 2: Import/export consistency
        const importIssues = this._checkImports(memory);
        allIssues.push(...importIssues);

        // Pass 3: File-level validation
        const validationIssues = await this._validateFiles(memory, framework);
        allIssues.push(...validationIssues);

        // Pass 4: Preview bundler dry-run (JSX/TSX Babel transform — same as Live Preview)
        const bundleIssues = this._bundlerDryRunIssues(memory, framework);
        allIssues.push(...bundleIssues);

        // Classify issues
        const classified = classifyIssues(allIssues);
        const rootCauses = attributeRootCauses(allIssues);

        if (memory) {
            for (const issue of allIssues) {
                memory.addError(issue);
            }
            memory.addDecision('reviewer', 'review_project',
                `Found ${classified.critical.length} critical, ${classified.errors.length} errors, ${classified.warnings.length} warnings`
            );
        }

        logger.info(`[ReviewerAgent] Review complete`, {
            critical: classified.critical.length,
            errors: classified.errors.length,
            warnings: classified.warnings.length,
            rootCauses: rootCauses.length,
        });

        return {
            reviewResult: {
                ...classified,
                rootCauses,
                allIssues,
                totalIssues: allIssues.length,
            },
        };
    }

    /**
     * Pass 1: Check structural integrity.
     * - Every planned file was generated
     * - Entry point exists
     */
    _checkStructure(memory, framework) {
        const issues = [];
        if (!memory) return issues;

        // Check for planned but not generated files
        for (const [filePath, record] of memory.files) {
            if (record.status === 'planned') {
                issues.push(createError('MISSING_FILE', {
                    phase: 'review',
                    agent: 'reviewer',
                    file: filePath,
                    message: `Planned file was not generated: ${filePath}`,
                }));
            }
            if (record.status === 'failed') {
                issues.push(createError('SYNTAX_ERROR', {
                    phase: 'review',
                    agent: 'reviewer',
                    file: filePath,
                    message: `File failed generation: ${filePath}`,
                    recommendation: 'regenerate',
                }));
            }
        }

        return issues;
    }

    /**
     * Pass 2: Check import/export consistency.
     * - Every local import resolves to a file
     * - Imported names exist as exports in target
     *
     * Produces detailed IMPORT_BROKEN errors with:
     *   importedName, targetFile, targetExists, targetExports,
     *   suggestion ('rename_import' | 'remove_import' | 'add_export'),
     *   suggestedFix (replacement name when suggestion is rename_import)
     */
    _checkImports(memory) {
        const issues = [];
        if (!memory) return issues;

        for (const [filePath, record] of memory.files) {
            if (!record.contracts?.imports) continue;
            if (record.status === 'failed' || record.status === 'planned') continue;

            for (const imp of record.contracts.imports) {
                // Only check local imports
                if (!imp.startsWith('.') && !imp.startsWith('/')) continue;

                const resolved = memory.resolveImport(filePath, imp);
                if (!resolved) {
                    issues.push(createError('IMPORT_BROKEN', {
                        phase: 'review',
                        agent: 'reviewer',
                        file: filePath,
                        message: `Broken import: "${imp}" does not resolve to any file in the project`,
                        importedName: null,
                        targetFile: imp,
                        targetExists: false,
                        targetExports: [],
                        suggestion: 'remove_import',
                        suggestedFix: null,
                    }));
                    continue;
                }

                // Target file exists — now check that the imported names match its exports
                const targetRecord = memory.getFile(resolved);
                const targetContracts = targetRecord?.contracts || { exports: [], defaultExport: null };
                const targetExportNames = [
                    ...(targetContracts.exports || []),
                    ...(targetContracts.defaultExport ? [targetContracts.defaultExport] : []),
                ];

                // Parse the import statement(s) referencing this path from the source content
                const importedNames = this._parseImportedNames(record.content, imp);

                for (const imported of importedNames) {
                    if (imported.isDefault) {
                        // Default import — check if target has a default export
                        if (!targetContracts.defaultExport) {
                            const suggestion = this._suggestFix(imported.name, targetExportNames);
                            issues.push(createError('IMPORT_BROKEN', {
                                phase: 'review',
                                agent: 'reviewer',
                                file: filePath,
                                message: `Broken import: default import "${imported.name}" from "${imp}" but target has no default export (exports: [${targetExportNames.join(', ')}])`,
                                importedName: imported.name,
                                targetFile: resolved,
                                targetExists: true,
                                targetExports: targetExportNames,
                                ...suggestion,
                            }));
                        }
                    } else {
                        // Named import — check if the name exists in target exports
                        const allExports = targetContracts.exports || [];
                        if (!allExports.includes(imported.name) && imported.name !== targetContracts.defaultExport) {
                            const suggestion = this._suggestFix(imported.name, targetExportNames);
                            issues.push(createError('IMPORT_BROKEN', {
                                phase: 'review',
                                agent: 'reviewer',
                                file: filePath,
                                message: `Broken import: named import "${imported.name}" from "${imp}" but target does not export it (exports: [${targetExportNames.join(', ')}])`,
                                importedName: imported.name,
                                targetFile: resolved,
                                targetExists: true,
                                targetExports: targetExportNames,
                                ...suggestion,
                            }));
                        }
                    }
                }
            }
        }

        return issues;
    }

    /**
     * Parse imported names from a file's content for a given import path.
     * Returns array of { name: string, isDefault: boolean }.
     */
    _parseImportedNames(content, importPath) {
        const results = [];
        if (!content) return results;

        // Escape the import path for use in regex
        const escapedPath = importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Match: import DefaultName from 'path'
        // Match: import DefaultName, { Named1, Named2 } from 'path'
        // Match: import { Named1, Named2 } from 'path'
        // Match: import * as Ns from 'path'
        const importRe = new RegExp(
            `import\\s+(.+?)\\s+from\\s+['"]${escapedPath}(?:\\.[a-z]+)?['"]`,
            'g'
        );

        let match;
        while ((match = importRe.exec(content))) {
            const clause = match[1].trim();

            // Namespace import: import * as Foo from 'path'
            if (clause.startsWith('*')) {
                const nsMatch = clause.match(/\*\s+as\s+(\w+)/);
                if (nsMatch) {
                    results.push({ name: nsMatch[1], isDefault: true });
                }
                continue;
            }

            // Named imports: import { A, B as C } from 'path'
            const namedOnlyRe = /^\{([^}]+)\}$/;
            const namedOnlyMatch = clause.match(namedOnlyRe);
            if (namedOnlyMatch) {
                this._extractNamedImports(namedOnlyMatch[1], results);
                continue;
            }

            // Combined: import Default, { A, B } from 'path'
            const combinedRe = /^(\w+)\s*,\s*\{([^}]+)\}$/;
            const combinedMatch = clause.match(combinedRe);
            if (combinedMatch) {
                results.push({ name: combinedMatch[1], isDefault: true });
                this._extractNamedImports(combinedMatch[2], results);
                continue;
            }

            // Default only: import Foo from 'path'
            const defaultRe = /^(\w+)$/;
            const defaultMatch = clause.match(defaultRe);
            if (defaultMatch) {
                results.push({ name: defaultMatch[1], isDefault: true });
                continue;
            }
        }

        return results;
    }

    /**
     * Extract named imports from the inside of { ... } clause.
     */
    _extractNamedImports(clause, results) {
        const names = clause.split(',');
        for (const n of names) {
            const trimmed = n.trim();
            if (!trimmed) continue;
            // Handle "A as B" — the local name is B but the exported name is A
            const asMatch = trimmed.match(/(\w+)\s+as\s+(\w+)/);
            if (asMatch) {
                // The imported name from the target is the original (asMatch[1])
                results.push({ name: asMatch[1], isDefault: false });
            } else {
                results.push({ name: trimmed, isDefault: false });
            }
        }
    }

    /**
     * Suggest a fix for a broken import given the target's available exports.
     * Returns { suggestion, suggestedFix }.
     */
    _suggestFix(importedName, targetExportNames) {
        if (targetExportNames.length === 0) {
            return { suggestion: 'remove_import', suggestedFix: null };
        }

        // Try case-insensitive match
        const lowerName = importedName.toLowerCase();
        const caseMatch = targetExportNames.find(e => e.toLowerCase() === lowerName);
        if (caseMatch) {
            return { suggestion: 'rename_import', suggestedFix: caseMatch };
        }

        // Try substring/prefix match
        const prefixMatch = targetExportNames.find(e =>
            e.toLowerCase().startsWith(lowerName) || lowerName.startsWith(e.toLowerCase())
        );
        if (prefixMatch) {
            return { suggestion: 'rename_import', suggestedFix: prefixMatch };
        }

        // If there's only one export, suggest renaming to it
        if (targetExportNames.length === 1) {
            return { suggestion: 'rename_import', suggestedFix: targetExportNames[0] };
        }

        // Can't confidently suggest a rename — suggest adding the export to the target
        return { suggestion: 'add_export', suggestedFix: null };
    }

    /**
     * Pass 3: Validate individual files that haven't been validated.
     */
    async _validateFiles(memory, framework) {
        const issues = [];
        if (!memory) return issues;

        for (const [filePath, record] of memory.files) {
            if (!record.content) continue;
            if (record.validation?.isValid === true) continue;
            if (record.status === 'failed') continue;

            try {
                const result = this.validator.validateFile(record.content, filePath, framework);
                if (!result.isValid) {
                    for (const error of (result.errors || [])) {
                        issues.push(createError('SYNTAX_ERROR', {
                            phase: 'review',
                            agent: 'reviewer',
                            file: filePath,
                            message: typeof error === 'string' ? error : error.message || JSON.stringify(error),
                        }));
                    }
                }
            } catch {
                // Validator threw — not a critical issue
            }
        }

        return issues;
    }

    /**
     * Pass 4: Same Babel transform as Live Preview; catches errors per-file validation may miss.
     */
    _bundlerDryRunIssues(memory, framework) {
        const issues = [];
        if (!memory) return issues;
        const fw = framework || 'react';
        if (!['react', 'react-ts'].includes(fw)) return issues;

        const files = memory.getGeneratedFiles();
        const bundleErrors = collectBundlerTransformErrors(files);
        for (const { path: filePath, errors } of bundleErrors) {
            for (const msg of errors) {
                issues.push(createError('BUNDLE_FAILURE', {
                    phase: 'review',
                    agent: 'reviewer',
                    file: filePath,
                    message: typeof msg === 'string' ? msg : String(msg),
                }));
            }
        }
        return issues;
    }
}
