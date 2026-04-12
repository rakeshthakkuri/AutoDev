/**
 * BaseLLMProvider — interface every provider must implement.
 */
export class BaseLLMProvider {
    constructor() {
        this.name = 'base';
    }

    /** @returns {boolean} */
    isAvailable() { return false; }

    /** @param {string} prompt @param {object} [options] */
    async generateCompletion(prompt, options = {}) {
        throw new Error(`${this.name}: generateCompletion not implemented`);
    }

    /** @param {string} prompt @param {object} [options] @param {(chunk: string) => void} [onChunk] */
    async generateCompletionStream(prompt, options = {}, onChunk) {
        throw new Error(`${this.name}: generateCompletionStream not implemented`);
    }

    /** @param {string} code @param {string} errorContext @param {object} [options] */
    async generateFix(code, errorContext, options = {}) {
        throw new Error(`${this.name}: generateFix not implemented`);
    }
}
