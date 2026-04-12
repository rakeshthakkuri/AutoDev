/**
 * Reviewer agent tools.
 */

/**
 * @param {import('./agent.js').ReviewerAgent} agent
 */
export function createReviewerTools(agent) {
    return {
        async reviewProject(state) {
            return agent.reviewProject(state);
        },
    };
}
