import { llmRouter } from './router.js';

export { llmRouter } from './router.js';
export { initializeModel } from './providers/gemini.js';

export const generateCompletion = (...args) => llmRouter.generateCompletion(...args);
export const generateCompletionStream = (...args) => llmRouter.generateCompletionStream(...args);
export const generateFix = (...args) => llmRouter.generateFix(...args);
