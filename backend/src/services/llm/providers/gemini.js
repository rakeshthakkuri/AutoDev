import { GoogleGenAI } from '@google/genai';
import config from '../../../config.js';
import logger from '../../logger.js';
import { BaseLLMProvider } from './base.js';
import { classifyProviderError, ContentLLMError } from '../errors.js';

let aiSingleton = null;

const DEFAULT_CODE_SYSTEM_PROMPT =
    'You are a professional code generator. Output ONLY raw code. NO markdown code fences, NO explanations, NO conversational text, NO backticks around URLs or attributes.';

const DEFAULT_FIX_SYSTEM_PROMPT =
    'You are a code repair agent. You receive code that has validation errors. ' +
    'Fix ONLY the errors described. Output ONLY the corrected, complete file code. ' +
    'No explanations, no markdown code fences, no conversational text. ' +
    'Preserve all existing functionality and styling.';

export async function initializeModel() {
    if (aiSingleton) return { ai: aiSingleton };
    const apiKey = config.llm.gemini.apiKey;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) is missing in environment variables.');
    }
    logger.info('Initializing Gemini (Google GenAI) client');
    aiSingleton = new GoogleGenAI({ apiKey });
    return { ai: aiSingleton };
}

function getAi() {
    if (!aiSingleton) throw new Error('Gemini not initialized — call initializeModel() first');
    return aiSingleton;
}

function buildGenConfig(options, defaultSystemPrompt) {
    const { temperature } = config.llm.gemini;
    const systemPrompt = options.systemPrompt || defaultSystemPrompt;
    const cfg = {
        systemInstruction: systemPrompt,
        temperature: options.temperature ?? temperature,
    };
    if (options.responseMimeType) {
        cfg.responseMimeType = options.responseMimeType;
        if (options.responseMimeType === 'application/json') {
            // Suppress thinking tokens when the response is structured — saves time + tokens.
            cfg.thinkingConfig = { thinkingBudget: 0 };
        }
    }
    if (typeof options.maxTokens === 'number') {
        cfg.maxOutputTokens = options.maxTokens;
    }
    return cfg;
}

export class GeminiProvider extends BaseLLMProvider {
    constructor() {
        super();
        this.name = 'gemini';
        this.model = config.llm.gemini.model;
    }

    isAvailable() {
        return !!config.llm.gemini.apiKey;
    }

    async generateCompletion(prompt, options = {}) {
        try {
            await initializeModel();
            const ai = getAi();
            const response = await ai.models.generateContent({
                model: options.model || this.model,
                contents: prompt,
                config: buildGenConfig(options, DEFAULT_CODE_SYSTEM_PROMPT),
            });
            const text = response.text ?? '';
            if (!text || text.trim().length === 0) {
                throw new ContentLLMError('Gemini returned empty response', { provider: this.name, raw: '' });
            }
            return text;
        } catch (err) {
            if (err instanceof ContentLLMError) throw err;
            throw classifyProviderError(err, this.name);
        }
    }

    async generateCompletionStream(prompt, options = {}, onChunk) {
        try {
            await initializeModel();
            const ai = getAi();
            const stream = await ai.models.generateContentStream({
                model: options.model || this.model,
                contents: prompt,
                config: buildGenConfig(options, DEFAULT_CODE_SYSTEM_PROMPT),
            });

            let fullText = '';
            for await (const chunk of stream) {
                const text = chunk.text ?? '';
                if (text) {
                    fullText += text;
                    if (typeof onChunk === 'function') onChunk(text, fullText);
                }
            }
            if (!fullText || fullText.trim().length === 0) {
                throw new ContentLLMError('Gemini stream returned empty response', { provider: this.name, raw: '' });
            }
            return fullText;
        } catch (err) {
            if (err instanceof ContentLLMError) throw err;
            throw classifyProviderError(err, this.name);
        }
    }

    async generateFix(prompt, options = {}) {
        try {
            await initializeModel();
            const ai = getAi();
            const response = await ai.models.generateContent({
                model: options.model || this.model,
                contents: prompt,
                config: buildGenConfig(options, DEFAULT_FIX_SYSTEM_PROMPT),
            });
            const text = response.text ?? '';
            if (!text || text.trim().length === 0) {
                throw new ContentLLMError('Gemini fix returned empty response', { provider: this.name, raw: '' });
            }
            return text;
        } catch (err) {
            if (err instanceof ContentLLMError) throw err;
            throw classifyProviderError(err, this.name);
        }
    }
}
