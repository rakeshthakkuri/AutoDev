// ═══════════════════════════════════════════════════════════════════════════════
// Centralized Configuration
// ═══════════════════════════════════════════════════════════════════════════════

import dotenv from 'dotenv';
dotenv.config();

const env = process.env.NODE_ENV || 'development';

const frontendUrl = process.env.FRONTEND_URL;

const config = {
    // ── Environment
    env,
    isDev: env === 'development',
    isProd: env === 'production',

    // ── PostgreSQL
    databaseUrl: process.env.DATABASE_URL || null,

    // ── Storage (Phase 1.5 / 2.3)
    storageProvider: process.env.STORAGE_PROVIDER || 'local',
    generatedDir: process.env.GENERATED_DIR || 'generated',

    // ── S3 (Phase 2.3)
    s3Bucket: process.env.S3_BUCKET || null,
    s3Region: process.env.S3_REGION || 'us-east-1',
    s3Prefix: process.env.S3_PREFIX || 'projects',
    s3Endpoint: process.env.S3_ENDPOINT || null,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || null,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || null,

    // ── Queue (Phase 2.1)
    queueConcurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) || 3,

    // ── Cleanup job (Phase 2.5)
    projectRetentionDays: parseInt(process.env.PROJECT_RETENTION_DAYS, 10) || 7,
    cleanupIntervalHours: parseInt(process.env.CLEANUP_INTERVAL_HOURS, 10) || 24,

    // ── Auth (Phase 3.2)
    jwtSecret: process.env.JWT_SECRET || null,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || null,

    // ── Server
    port: parseInt(process.env.PORT, 10) || 5001,
    corsOrigins: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',')
        : frontendUrl
            ? [frontendUrl]
            : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],

    // ── LLM Provider (single pinned provider — Gemini OR Anthropic, chosen via env)
    llm: {
        // Required: which provider to use. No automatic crossover — exactly one is active.
        // Validated at startup (see validateLlmConfig below).
        primaryProvider: (process.env.LLM_PRIMARY_PROVIDER || '').toLowerCase().trim(),

        gemini: {
            apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
            model: process.env.GEMINI_MODEL || process.env.LLM_MODEL || 'gemini-2.5-flash',
            maxTokensDefault: parseInt(process.env.LLM_MAX_TOKENS, 10) || 4096,
            maxTokensLarge: parseInt(process.env.LLM_MAX_TOKENS_LARGE, 10) || 8192,
            temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.1,
        },
        anthropic: {
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
            maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS, 10) || 8192,
        },

        // Retry policy applied uniformly to the pinned provider for transient errors.
        // Worst-case wait with defaults: 1+2+4+8+16+30 = ~61s before surfacing the error.
        retry: {
            maxAttempts: parseInt(process.env.LLM_RETRY_MAX_ATTEMPTS, 10) || 6,
            initialBackoffMs: parseInt(process.env.LLM_RETRY_INITIAL_MS, 10) || 1000,
            maxBackoffMs: parseInt(process.env.LLM_RETRY_MAX_MS, 10) || 30000,
            jitterMs: parseInt(process.env.LLM_RETRY_JITTER_MS, 10) || 250,
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
        maxFileTimeout: parseInt(process.env.MAX_FILE_TIMEOUT, 10) || 240000,       // 4 min per file (avoids "Phase timeout exceeded" on slow LLM)
        maxTotalTimeout: parseInt(process.env.MAX_TOTAL_TIMEOUT, 10) || 600000,     // 10 min total
        maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3,
        concurrentBatchSize: parseInt(process.env.CONCURRENT_BATCH, 10) || 3,
    },

    // ── Agent (orchestrator)
    agent: {
        maxSteps: parseInt(process.env.AGENT_MAX_STEPS, 10) || 500,
        maxFixAttempts: parseInt(process.env.AGENT_MAX_FIX_ATTEMPTS, 10) || 3,
        maxFixAttemptsTruncation: parseInt(process.env.AGENT_MAX_FIX_ATTEMPTS_TRUNCATION, 10) || 3,
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

    // ── Agent version — v2 only (Phase 1.6)
    agentVersion: 'v2',

    // ── Supported frameworks/styling (single source of truth for validation and prompts)
    defaultFramework: 'vanilla-js',
    frameworks: ['vanilla-js', 'react', 'react-ts', 'nextjs', 'vue', 'svelte', 'angular', 'astro'],
    stylingOptions: ['tailwind', 'plain-css', 'css-modules', 'styled-components', 'scss'],
    complexityLevels: ['simple', 'intermediate', 'advanced'],
};

// ─── LLM startup validation ──────────────────────────────────────────────────
// Fail loud if the LLM is misconfigured. Only allows BUILD_CHECK to skip
// (for `npm run build` / Docker image build where secrets are not present).
function validateLlmConfig() {
    if (process.env.BUILD_CHECK === '1') return;

    const provider = config.llm.primaryProvider;
    if (!provider) {
        throw new Error(
            'LLM_PRIMARY_PROVIDER is not set. Set it to "gemini" or "anthropic" in your environment.'
        );
    }
    if (provider !== 'gemini' && provider !== 'anthropic') {
        throw new Error(
            `Invalid LLM_PRIMARY_PROVIDER="${provider}". Must be "gemini" or "anthropic".`
        );
    }

    if (provider === 'gemini' && !config.llm.gemini.apiKey) {
        throw new Error(
            'LLM_PRIMARY_PROVIDER=gemini but GEMINI_API_KEY (or GOOGLE_API_KEY) is missing.'
        );
    }
    if (provider === 'anthropic' && !config.llm.anthropic.apiKey) {
        throw new Error(
            'LLM_PRIMARY_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing.'
        );
    }

    if (config.llm.retry.maxAttempts < 1) {
        throw new Error('LLM_RETRY_MAX_ATTEMPTS must be >= 1.');
    }
}

validateLlmConfig();

export default config;
