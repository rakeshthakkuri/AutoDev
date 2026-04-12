/**
 * Coder agent tools — used by the orchestrator graph.
 */

/**
 * Create coder tools that delegate to the CoderAgent.
 * @param {import('./agent.js').CoderAgent} agent
 */
export function createCoderTools(agent) {
    return {
        async generateNext(state) {
            return agent.generateNext(state);
        },
    };
}
