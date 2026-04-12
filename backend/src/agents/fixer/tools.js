/**
 * Fixer agent tools.
 */

/**
 * @param {import('./agent.js').FixerAgent} agent
 */
export function createFixerTools(agent) {
    return {
        async fixIssues(state) {
            return agent.fixIssues(state);
        },
    };
}
