/**
 * Editor agent tools.
 */

/**
 * @param {import('./agent.js').EditorAgent} agent
 */
export function createEditorTools(agent) {
    return {
        async handleDirectEdit(params) {
            return agent.handleDirectEdit(params);
        },
        async handlePromptRefinement(params) {
            return agent.handlePromptRefinement(params);
        },
        async handleFeatureAddition(params) {
            return agent.handleFeatureAddition(params);
        },
    };
}
