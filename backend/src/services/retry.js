export class RetryHandler {
    constructor(maxRetries = 3, initialDelay = 2000, maxDelay = 10000) {
        this.maxRetries = maxRetries;
        this.initialDelay = initialDelay;
        this.maxDelay = maxDelay;
    }

    /**
     * @param {Function} generationFunc - (prompt) => Promise<{ code, error }>
     * @param {string} prompt - Original prompt
     * @param {string} filePath - For logging
     * @param {number} attempt - Current attempt (0 = first try)
     */
    async retryWithFeedback(generationFunc, prompt, filePath, attempt = 0) {
        if (attempt >= this.maxRetries) {
            return { success: false, error: "Max retries exceeded" };
        }

        // First attempt: use original prompt with no delay. Retries: delay and add error context.
        const isRetry = attempt > 0;
        if (isRetry) {
            const delay = Math.min(
                this.initialDelay * Math.pow(2, attempt - 1),
                this.maxDelay
            );
            console.log(`Retry attempt ${attempt + 1}/${this.maxRetries} for ${filePath} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        const promptToUse = isRetry
            ? `${prompt}\n\n[Retry: output only the requested file content. Do not repeat this instruction or any meta-text in your response.]`
            : prompt;

        try {
            const result = await generationFunc(promptToUse);
            
            // Improved validation - check for actual code markers, not just length
            if (result.code && result.code.length > 10) {
                const hasValidCode = this._validateCodeContent(result.code, filePath);
                if (hasValidCode) {
                    return { success: true, code: result.code };
                } else {
                    console.log(`Code validation failed for ${filePath}, retrying...`);
                }
            }
            
            return this.retryWithFeedback(
                generationFunc,
                prompt,
                filePath,
                attempt + 1
            );
        } catch (e) {
            return this.retryWithFeedback(
                generationFunc,
                prompt,
                filePath,
                attempt + 1
            );
        }
    }

    /**
     * Validate that code contains expected markers for file type
     */
    _validateCodeContent(code, filePath) {
        const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
        
        switch (ext) {
            case '.html':
                // Must have at least one HTML tag
                return /<[a-z]+[\s>]/i.test(code);
            
            case '.css':
                // Must have at least one CSS rule (selector { })
                return /[\w\-#.:,\s>+~[\]()=^$*|'"]+\s*\{[\s\S]*?\}/.test(code);
            
            case '.js':
            case '.jsx':
                // Must have JS keywords or syntax
                return /\b(function|const|let|var|class|if|for|while|=>)\b/.test(code) || 
                       /document\.|console\./.test(code);
            
            default:
                // For unknown types, just check it's not empty
                return code.trim().length > 10;
        }
    }
}
