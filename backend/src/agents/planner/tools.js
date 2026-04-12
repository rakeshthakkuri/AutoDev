/**
 * Planner agent tools — used by the orchestrator graph.
 */

/**
 * Create planner tools that delegate to the PlannerAgent.
 * @param {import('./agent.js').PlannerAgent} agent
 */
export function createPlannerTools(agent) {
    return {
        async createPlan(state) {
            return agent.createPlan(state);
        },
        async validatePlan(state) {
            return agent.validatePlan(state);
        },
        async revisePlan(state) {
            return agent.revisePlan(state);
        },
    };
}
