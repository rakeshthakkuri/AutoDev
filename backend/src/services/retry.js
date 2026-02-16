
export class RetryHandler {
    constructor(maxRetries = 3, initialDelay = 2000, maxDelay = 10000) {
        this.maxRetries = maxRetries;
        this.initialDelay = initialDelay;
        this.maxDelay = maxDelay;
    }

    async retryWithFeedback(generationFunc, prompt, errorContext, filePath, attempt = 0) {
        if (attempt >= this.maxRetries) {
            return { success: false, error: "Max retries exceeded" };
        }

        const delay = Math.min(
            this.initialDelay * Math.pow(2, attempt),
            this.maxDelay
        );

        console.log(`Retry attempt ${attempt + 1}/${this.maxRetries} for ${filePath} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Enhance prompt with error context
        const retryPrompt = `${prompt}\n\nPREVIOUS ERROR: ${errorContext}\n\nFix the error and generate the code again.`;

        try {
            const result = await generationFunc(retryPrompt);
            if (result.code && result.code.length > 10) {
                return { success: true, code: result.code };
            } else {
                return this.retryWithFeedback(
                    generationFunc,
                    prompt,
                    result.error || "Empty code generated",
                    filePath,
                    attempt + 1
                );
            }
        } catch (e) {
            return this.retryWithFeedback(
                generationFunc,
                prompt,
                e.message,
                filePath,
                attempt + 1
            );
        }
    }
}
