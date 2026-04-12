/**
 * Structured agent error — classifies errors by phase, type, and recoverability.
 */
export class AgentError {
    constructor({ phase, agent, file, type, message, recoverable = true, recommendation = 'retry' }) {
        this.phase = phase;             // 'planning' | 'generation' | 'review' | 'fix' | 'edit'
        this.agent = agent;             // 'planner' | 'coder' | 'reviewer' | 'fixer' | 'editor'
        this.file = file || null;       // File path or null for project-level errors
        this.type = type;               // Error classification key
        this.message = message;
        this.recoverable = recoverable;
        this.recommendation = recommendation; // 'retry' | 'fix' | 'regenerate' | 'revise_plan' | 'skip' | 'abort'
        this.timestamp = Date.now();
    }

    toJSON() {
        return {
            phase: this.phase,
            agent: this.agent,
            file: this.file,
            type: this.type,
            message: this.message,
            recoverable: this.recoverable,
            recommendation: this.recommendation,
            timestamp: this.timestamp,
        };
    }
}

/**
 * Error type taxonomy — each type has default recoverability and recommendation.
 */
export const ERROR_TYPES = {
    // LLM errors
    LLM_TIMEOUT:        { recoverable: true,  recommendation: 'retry' },
    LLM_TRUNCATION:     { recoverable: true,  recommendation: 'retry' },
    LLM_REFUSAL:        { recoverable: true,  recommendation: 'retry' },
    LLM_INVALID_JSON:   { recoverable: true,  recommendation: 'retry' },
    LLM_RATE_LIMIT:     { recoverable: true,  recommendation: 'retry' },

    // Code errors
    SYNTAX_ERROR:       { recoverable: true,  recommendation: 'fix' },
    IMPORT_BROKEN:      { recoverable: true,  recommendation: 'fix' },
    EXPORT_MISSING:     { recoverable: true,  recommendation: 'fix' },
    TYPE_ERROR:         { recoverable: true,  recommendation: 'fix' },
    CONVERSATIONAL:     { recoverable: true,  recommendation: 'regenerate' },

    // Plan errors
    MISSING_FILE:       { recoverable: true,  recommendation: 'revise_plan' },
    WRONG_FRAMEWORK:    { recoverable: false, recommendation: 'abort' },
    CIRCULAR_DEPENDENCY:{ recoverable: true,  recommendation: 'revise_plan' },
    FILE_COUNT_MISMATCH:{ recoverable: true,  recommendation: 'revise_plan' },
    MISSING_ENTRY:      { recoverable: true,  recommendation: 'revise_plan' },

    // Project errors
    NO_ENTRY_POINT:     { recoverable: true,  recommendation: 'regenerate' },
    BUNDLE_FAILURE:     { recoverable: true,  recommendation: 'fix' },
    DESIGN_DRIFT:       { recoverable: true,  recommendation: 'fix' },

    // System errors
    CIRCUIT_OPEN:       { recoverable: false, recommendation: 'abort' },
    BUDGET_EXCEEDED:    { recoverable: false, recommendation: 'finalize_partial' },
    TIMEOUT:            { recoverable: false, recommendation: 'finalize_partial' },
};

/**
 * Create an AgentError with defaults from the taxonomy.
 */
export function createError(type, overrides = {}) {
    const defaults = ERROR_TYPES[type] || { recoverable: true, recommendation: 'retry' };
    return new AgentError({
        type,
        recoverable: defaults.recoverable,
        recommendation: defaults.recommendation,
        ...overrides,
    });
}

/**
 * Classify a list of issues by severity — critical, errors, warnings.
 */
export function classifyIssues(issues) {
    const critical = issues.filter(i =>
        i.type === 'NO_ENTRY_POINT' ||
        i.type === 'WRONG_FRAMEWORK' ||
        (i.type === 'IMPORT_BROKEN' && i.isEntryPath)
    );

    const errors = issues.filter(i =>
        i.type === 'SYNTAX_ERROR' ||
        i.type === 'IMPORT_BROKEN' ||
        i.type === 'EXPORT_MISSING' ||
        i.type === 'TYPE_ERROR' ||
        i.type === 'BUNDLE_FAILURE'
    );

    const warnings = issues.filter(i =>
        i.type === 'DESIGN_DRIFT' ||
        i.type === 'MISSING_FILE' ||
        i.type === 'FILE_COUNT_MISMATCH'
    );

    return { critical, errors, warnings };
}

/**
 * Attribute root causes from a list of import-related issues.
 * If multiple files import from the same broken source, that source is the root cause.
 */
export function attributeRootCauses(issues) {
    const causes = [];

    // Count how many files have broken imports pointing to the same target
    const importTargets = {};
    for (const issue of issues) {
        if (issue.type === 'IMPORT_BROKEN' && issue.targetFile) {
            importTargets[issue.targetFile] = (importTargets[issue.targetFile] || 0) + 1;
        }
    }

    for (const [file, count] of Object.entries(importTargets)) {
        if (count >= 2) {
            causes.push({
                type: 'bad_source_file',
                file,
                impact: count,
                recommendation: 'regenerate',
                originalErrors: issues.filter(i => i.targetFile === file),
            });
        }
    }

    // Sort by impact (highest first)
    causes.sort((a, b) => b.impact - a.impact);

    return causes;
}
