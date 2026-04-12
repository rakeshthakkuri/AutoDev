import { GoogleGenAI } from '@google/genai';
import config from '../../../config.js';
import logger from '../../logger.js';
import { BaseLLMProvider } from './base.js';

let aiSingleton = null;

export async function initializeModel() {
    if (aiSingleton) return { ai: aiSingleton };

    const apiKey = config.llm.gemini.apiKey;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) is missing in environment variables.');
    }

    try {
        logger.info('Initializing Gemini (Google GenAI) client...');
        aiSingleton = new GoogleGenAI({ apiKey });
        logger.info('Gemini client initialized successfully');
        return { ai: aiSingleton };
    } catch (e) {
        logger.error('Failed to initialize Gemini client:', e);
        throw e;
    }
}

function getAi() {
    if (!aiSingleton) throw new Error('Gemini not initialized — call initializeModel() first');
    return aiSingleton;
}

const { model, maxTokensDefault, temperature } = config.llm.gemini;

export class GeminiProvider extends BaseLLMProvider {
    constructor() {
        super();
        this.name = 'gemini';
    }

    isAvailable() {
        return !!(config.llm.gemini.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    }

    async generateCompletion(prompt, options = {}) {
        await initializeModel();
        const ai = getAi();

        const systemPrompt = options.systemPrompt || 'You are a professional code generator. Output ONLY raw code. NO markdown code fences, NO explanations, NO conversational text, NO backticks around URLs or attributes.';

        const genConfig = {
            systemInstruction: systemPrompt,
            maxOutputTokens: options.maxTokens || maxTokensDefault,
            temperature: options.temperature ?? temperature,
            ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
        };

        if (options.responseMimeType === 'application/json') {
            genConfig.thinkingConfig = { thinkingBudget: 0 };
        }

        const response = await ai.models.generateContent({
            model: options.model || model,
            contents: prompt,
            config: genConfig,
        });

        return response.text ?? '';
    }

    async generateCompletionStream(prompt, options = {}, onChunk) {
        await initializeModel();
        const ai = getAi();

        const systemPrompt = options.systemPrompt || 'You are a professional code generator. Output ONLY raw code. NO markdown code fences, NO explanations, NO conversational text, NO backticks around URLs or attributes.';

        const stream = await ai.models.generateContentStream({
            model: options.model || model,
            contents: prompt,
            config: {
                systemInstruction: systemPrompt,
                maxOutputTokens: options.maxTokens || maxTokensDefault,
                temperature: options.temperature ?? temperature,
            },
        });

        let fullText = '';
        for await (const chunk of stream) {
            const text = chunk.text ?? '';
            if (text) {
                fullText += text;
                if (onChunk && typeof onChunk === 'function') onChunk(text, fullText);
            }
        }
        return fullText;
    }

    async generateFix(prompt, options = {}) {
        await initializeModel();
        const ai = getAi();

        const systemPrompt = options.systemPrompt ||
            'You are a code repair agent. You receive code that has validation errors. ' +
            'Fix ONLY the errors described. Output ONLY the corrected, complete file code. ' +
            'No explanations, no markdown code fences, no conversational text. ' +
            'Preserve all existing functionality and styling.';

        const fixConfig = {
            systemInstruction: systemPrompt,
            maxOutputTokens: options.maxTokens || maxTokensDefault,
            temperature: options.temperature ?? temperature,
            ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
        };

        if (options.responseMimeType === 'application/json') {
            fixConfig.thinkingConfig = { thinkingBudget: 0 };
        }

        const response = await ai.models.generateContent({
            model: options.model || model,
            contents: prompt,
            config: fixConfig,
        });

        return response.text ?? '';
    }
}
