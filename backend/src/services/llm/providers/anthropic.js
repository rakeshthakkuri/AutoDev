import config from '../../../config.js';
import logger from '../../logger.js';
import { BaseLLMProvider } from './base.js';
import { classifyProviderError, ContentLLMError } from '../errors.js';

const DEFAULT_CODE_SYSTEM_PROMPT =
    'You are a professional code generator. Output ONLY raw code. NO markdown code fences, NO explanations, NO conversational text, NO backticks around URLs or attributes.';

const DEFAULT_FIX_SYSTEM_PROMPT =
    'You are a code repair agent. You receive code that has validation errors. ' +
    'Fix ONLY the errors described. Output ONLY the corrected, complete file code. ' +
    'No explanations, no markdown code fences, no conversational text. ' +
    'Preserve all existing functionality and styling.';

export class AnthropicProvider extends BaseLLMProvider {
    constructor() {
        super();
        this.name = 'anthropic';
        this.model = config.llm.anthropic.model;
        this._client = null;
    }

    isAvailable() {
        return !!config.llm.anthropic.apiKey;
    }

    async _getClient() {
        if (this._client) return this._client;
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const apiKey = config.llm.anthropic.apiKey;
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY is missing in environment variables.');
        this._client = new Anthropic({ apiKey });
        logger.info('Anthropic client initialized', { model: this.model });
        return this._client;
    }

    _baseRequest(prompt, options, defaultSystemPrompt) {
        const request = {
            model: options.model || this.model,
            messages: [{ role: 'user', content: prompt }],
            system: options.systemPrompt || defaultSystemPrompt,
            max_tokens: typeof options.maxTokens === 'number'
                ? options.maxTokens
                : config.llm.anthropic.maxTokens,
        };
        if (typeof options.temperature === 'number') request.temperature = options.temperature;
        return request;
    }

    async generateCompletion(prompt, options = {}) {
        try {
            const client = await this._getClient();
            const message = await client.messages.create(this._baseRequest(prompt, options, DEFAULT_CODE_SYSTEM_PROMPT));
            const text = message.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('');
            if (!text || text.trim().length === 0) {
                throw new ContentLLMError('Anthropic returned empty response', { provider: this.name, raw: '' });
            }
            return text;
        } catch (err) {
            if (err instanceof ContentLLMError) throw err;
            throw classifyProviderError(err, this.name);
        }
    }

    async generateCompletionStream(prompt, options = {}, onChunk) {
        try {
            const client = await this._getClient();
            const stream = await client.messages.create({
                ...this._baseRequest(prompt, options, DEFAULT_CODE_SYSTEM_PROMPT),
                stream: true,
            });
            let fullText = '';
            for await (const event of stream) {
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                    const delta = event.delta.text || '';
                    if (delta) {
                        fullText += delta;
                        if (typeof onChunk === 'function') onChunk(delta, fullText);
                    }
                }
            }
            if (!fullText || fullText.trim().length === 0) {
                throw new ContentLLMError('Anthropic stream returned empty response', { provider: this.name, raw: '' });
            }
            return fullText;
        } catch (err) {
            if (err instanceof ContentLLMError) throw err;
            throw classifyProviderError(err, this.name);
        }
    }

    async generateFix(prompt, options = {}) {
        try {
            const client = await this._getClient();
            const message = await client.messages.create(this._baseRequest(prompt, options, DEFAULT_FIX_SYSTEM_PROMPT));
            const text = message.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('');
            if (!text || text.trim().length === 0) {
                throw new ContentLLMError('Anthropic fix returned empty response', { provider: this.name, raw: '' });
            }
            return text;
        } catch (err) {
            if (err instanceof ContentLLMError) throw err;
            throw classifyProviderError(err, this.name);
        }
    }
}
