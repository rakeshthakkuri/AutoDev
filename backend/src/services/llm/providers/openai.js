import config from '../../../config.js';
import logger from '../../logger.js';
import { BaseLLMProvider } from './base.js';

export class OpenAIProvider extends BaseLLMProvider {
    constructor() {
        super();
        this.name = 'openai';
        this._client = null;
    }

    isAvailable() {
        return !!(config.llm.openai?.apiKey || process.env.OPENAI_API_KEY);
    }

    async _getClient() {
        if (this._client) return this._client;
        const { default: OpenAI } = await import('openai');
        const apiKey = config.llm.openai?.apiKey || process.env.OPENAI_API_KEY;
        this._client = new OpenAI({ apiKey });
        return this._client;
    }

    async generateCompletion(prompt, options = {}) {
        const client = await this._getClient();
        const modelName = options.model || config.llm.openai?.model || 'gpt-4o';
        const response = await client.chat.completions.create({
            model: modelName,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: options.maxTokens || 8192,
        });
        const text = response.choices[0].message.content;
        logger.debug('OpenAI completion', { length: text?.length });
        return text || '';
    }

    async generateCompletionStream(prompt, options = {}, onChunk) {
        const client = await this._getClient();
        const modelName = options.model || config.llm.openai?.model || 'gpt-4o';
        const stream = await client.chat.completions.create({
            model: modelName,
            messages: [{ role: 'user', content: prompt }],
            stream: true,
            max_tokens: options.maxTokens || 8192,
        });
        let fullText = '';
        for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            fullText += text;
            if (text && onChunk) await onChunk(text, fullText);
        }
        return fullText;
    }

    async generateFix(prompt, options = {}) {
        return this.generateCompletion(prompt, options);
    }
}
