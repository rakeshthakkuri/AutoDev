import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import config from './config.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { deprecationApiHeaders } from './middleware/deprecationApi.js';
import logger from './services/logger.js';
import { initializeModel } from './services/llm.js';
import { AnalysisService } from './services/analysis.js';
import { ProjectGenerationService } from './services/projectGeneration.js';
import { createStorageService } from './services/storage/index.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';
import healthRouter from './routes/health.js';
import { createDownloadRouter } from './routes/download.js';
import { createAnalyzeRouter } from './routes/analyze.js';
import { createPlanRouter } from './routes/plan.js';
import { createGenerateRouter } from './routes/generate.js';
import { createBundleRouter } from './routes/bundle.js';
import { createEditRouter } from './routes/edit.js';
import { createMetricsRouter } from './routes/metrics.js';
import { createAuthRouter } from './routes/auth.js';
import { createV1Router } from './routes/v1/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'generated');

if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });

const storageService = await createStorageService();

const queueAvailable = false;

const analysisService = new AnalysisService();
const projectGenerationService = new ProjectGenerationService(GENERATED_DIR, storageService);
projectGenerationService._analysisService = analysisService;

const app = express();
const server = http.createServer(app);

// Behind Fly.io / other reverse proxies so rate limits and req.ip use the real client.
if (process.env.TRUST_PROXY) {
    const raw = process.env.TRUST_PROXY.trim();
    if (raw === 'true' || raw === '1') {
        app.set('trust proxy', 1);
    } else if (/^\d+$/.test(raw)) {
        app.set('trust proxy', parseInt(raw, 10));
    } else {
        app.set('trust proxy', raw);
    }
} else if (config.isProd) {
    app.set('trust proxy', 1);
}

app.use(requestIdMiddleware);

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

app.use(compression());

app.use(cors({
    origin: config.isProd ? config.corsOrigins : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Id', 'x-request-id'],
}));

app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (req.path !== '/health') {
            logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
        }
    });
    next();
});

const apiLimiter = rateLimit({
    windowMs: config.rateLimit.api.windowMs,
    max: config.rateLimit.api.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute.' },
});

const generationLimiter = rateLimit({
    windowMs: config.rateLimit.generation.windowMs,
    max: config.rateLimit.generation.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Generation rate limit exceeded. Please wait before generating again.' },
});

app.use('/api', deprecationApiHeaders);
app.use('/api/', apiLimiter);

app.use(healthRouter);
app.use('/download', createDownloadRouter(storageService));
app.use('/auth', createAuthRouter());
app.use('/v1', createV1Router({
    generationService: projectGenerationService,
    storageService,
    queueAvailable,
}));
app.use('/api/analyze', generationLimiter, createAnalyzeRouter(analysisService));
app.use('/api/plan', generationLimiter, createPlanRouter(analysisService));
app.use('/api/generate', generationLimiter, createGenerateRouter({
    generationService: projectGenerationService,
    queueAvailable,
}));
app.use('/api/bundle', createBundleRouter());
app.use('/api/edit', generationLimiter, createEditRouter({
    validator: projectGenerationService.validator,
    generationService: projectGenerationService,
}));
app.use('/api/metrics', createMetricsRouter());

app.use(errorHandler);

try {
    await import('./agents/index.js');
    logger.info('V2 agent pipeline loaded successfully');
} catch (err) {
    logger.error('V2 agent pipeline failed to load', { error: err.message });
}

let isShuttingDown = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`${signal} received. Shutting down gracefully...`);

    stopScheduler();

    if (server.closeAllConnections) server.closeAllConnections();
    if (server.closeIdleConnections) server.closeIdleConnections();

    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });

    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 4000);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
});

const PORT = config.port;

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} already in use. Run: lsof -ti:${PORT} | xargs kill`);
        process.exit(1);
    }
    logger.error('Server error', err);
    process.exit(1);
});

if (!process.env.BUILD_CHECK) {
    server.listen(PORT, async () => {
        logger.info(`Backend v2.0 running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
        try {
            await initializeModel();
        } catch (e) {
            logger.error('Failed to initialize model on startup', e);
        }
        startScheduler(storageService);
    });
}

export { app };
