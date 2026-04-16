import config from '../../../config.js';
import logger from '../../logger.js';
import { BaseLLMProvider } from './base.js';

export class AnthropicProvider extends BaseLLMProvider {
    constructor() {
        super();
        this.name = 'anthropic';
        this._client = null;
    }

    isAvailable() {
        return !!(config.llm.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY);
    }

    async _getClient() {
        if (this._client) return this._client;
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const apiKey = config.llm.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY;
        this._client = new Anthropic({ apiKey });
        return this._client;
    }

    async generateCompletion(prompt, options = {}) {
        const client = await this._getClient();
        const modelName = options.model || config.llm.anthropic?.model || 'claude-sonnet-4-20250514';
        const request = {
            model: modelName,
            messages: [{ role: 'user', content: prompt }],
        };
        if (typeof options.maxTokens === 'number') {
            request.max_tokens = options.maxTokens;
        }
        if (options.systemPrompt) {
            request.system = options.systemPrompt;
        }
        const message = await client.messages.create(request);
        const text = message.content[0].type === 'text' ? message.content[0].text : '';
        logger.debug('Anthropic completion', { length: text.length });
        return text;
    }

    async generateCompletionStream(prompt, options = {}, onChunk) {
        const client = await this._getClient();
        const modelName = options.model || config.llm.anthropic?.model || 'claude-sonnet-4-20250514';
        let fullText = '';
        const request = {
            model: modelName,
            messages: [{ role: 'user', content: prompt }],
            stream: true,
        };
        if (typeof options.maxTokens === 'number') {
            request.max_tokens = options.maxTokens;
        }
        if (options.systemPrompt) {
            request.system = options.systemPrompt;
        }
        const stream = await client.messages.create(request);
        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                fullText += event.delta.text;
                if (onChunk) await onChunk(event.delta.text, fullText);
            }
        }
        return fullText;
    }

    async generateFix(prompt, options = {}) {
        return this.generateCompletion(prompt, options);
    }
}
