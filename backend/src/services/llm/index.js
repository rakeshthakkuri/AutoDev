// Public LLM surface — single pinned provider via the dispatcher.
// Old multi-provider router was removed as part of Phase A.
import { llmDispatcher, runWithRetryHooks } from './dispatcher.js';

export { llmDispatcher, runWithRetryHooks };
export { initializeModel } from './providers/gemini.js';
export {
    LLMError,
    TransientLLMError,
    HardLLMError,
    ContentLLMError,
    classifyProviderError,
} from './errors.js';

export const generateCompletion = (...args) => llmDispatcher.generateCompletion(...args);
export const generateCompletionStream = (...args) => llmDispatcher.generateCompletionStream(...args);
export const generateFix = (...args) => llmDispatcher.generateFix(...args);
export const getActiveProvider = () => llmDispatcher.providerName;
