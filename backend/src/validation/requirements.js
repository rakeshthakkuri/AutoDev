import config from '../config.js';

/**
 * Validate requirements object for /api/plan.
 * Returns an object of field errors, or null if valid.
 */
export function validateRequirements(requirements) {
    const errors = {};
    if (requirements.framework != null && !config.frameworks.includes(requirements.framework)) {
        errors.framework = `Must be one of: ${config.frameworks.join(', ')}`;
    }
    if (requirements.stylingFramework != null && !config.stylingOptions.includes(requirements.stylingFramework)) {
        errors.stylingFramework = `Must be one of: ${config.stylingOptions.join(', ')}`;
    }
    if (requirements.complexity != null && !config.complexityLevels.includes(requirements.complexity)) {
        errors.complexity = `Must be one of: ${config.complexityLevels.join(', ')}`;
    }
    if (requirements.projectType != null && (typeof requirements.projectType !== 'string' || !requirements.projectType.trim())) {
        errors.projectType = 'Must be a non-empty string';
    }
    return Object.keys(errors).length ? errors : null;
}
