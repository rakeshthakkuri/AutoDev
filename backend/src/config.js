// ═══════════════════════════════════════════════════════════════════════════════
// Centralized Configuration
// ═══════════════════════════════════════════════════════════════════════════════

import dotenv from 'dotenv';
dotenv.config();

const env = process.env.NODE_ENV || 'development';

const config = {
    // ── Environment
    env,
    isDev: env === 'development',
    isProd: env === 'production',

    // ── Server
    port: parseInt(process.env.PORT, 10) || 5001,
    corsOrigins: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',')
        : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],

    // ── LLM Provider
    llm: {
        provider: process.env.LLM_PROVIDER || 'anthropic',  // 'anthropic' | 'openai'

        // Anthropic
        anthropic: {
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
            maxTokensDefault: parseInt(process.env.LLM_MAX_TOKENS, 10) || 4096,
            maxTokensLarge: parseInt(process.env.LLM_MAX_TOKENS_LARGE, 10) || 8192,
            temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.1,
        },

        // OpenAI (future support)
        openai: {
            apiKey: process.env.OPENAI_API_KEY || '',
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            maxTokensDefault: 4096,
            temperature: 0.1,
        },
    },

    // ── Rate Limiting
    rateLimit: {
        api: {
            windowMs: 60 * 1000,
            max: parseInt(process.env.RATE_LIMIT_API, 10) || 30,
        },
        generation: {
            windowMs: 60 * 1000,
            max: parseInt(process.env.RATE_LIMIT_GENERATION, 10) || 10,
        },
    },

    // ── Generation
    generation: {
        maxFileTimeout: parseInt(process.env.MAX_FILE_TIMEOUT, 10) || 120000,       // 2 min per file
        maxTotalTimeout: parseInt(process.env.MAX_TOTAL_TIMEOUT, 10) || 300000,      // 5 min total
        maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3,
        concurrentBatchSize: parseInt(process.env.CONCURRENT_BATCH, 10) || 3,
    },

    // ── Cache
    cache: {
        analysisMax: 200,
        analysisTtl: 30 * 60 * 1000,   // 30 min
        planMax: 100,
        planTtl: 30 * 60 * 1000,       // 30 min
    },

    // ── Logging
    logging: {
        level: process.env.LOG_LEVEL || (env === 'production' ? 'warn' : 'info'),
        maxFileSize: 5 * 1024 * 1024,   // 5MB
        maxFiles: 5,
    },

    // ── Supported frameworks/styling (used for validation)
    frameworks: ['vanilla-js', 'react', 'react-ts', 'nextjs', 'vue', 'svelte', 'angular', 'astro'],
    stylingOptions: ['tailwind', 'plain-css', 'css-modules', 'styled-components', 'scss'],
    complexityLevels: ['simple', 'intermediate', 'advanced'],
};

export default config;
