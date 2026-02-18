import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import winston from 'winston';
import archiver from 'archiver';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

// Services
import { initializeModel } from './services/llm.js';
import { AnalysisService } from './services/analysis.js';
import { ProjectGenerationService } from './services/projectGeneration.js';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '../..');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'generated');
const LOG_DIR = path.join(__dirname, '../logs');

if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ─── Logging ─────────────────────────────────────────────────────────────────

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.File({ filename: path.join(LOG_DIR, 'error.log'), level: 'error', maxsize: 5242880, maxFiles: 3 }),
        new winston.transports.File({ filename: path.join(LOG_DIR, 'app.log'), maxsize: 5242880, maxFiles: 5 }),
        new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), winston.format.simple()) })
    ]
});

// ─── Initialize Express App ──────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

const CORS_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];

// ─── Middleware ───────────────────────────────────────────────────────────────

// Security headers (allow iframe same-origin for preview)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

// Compression
app.use(compression());

// CORS
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? CORS_ORIGINS : '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));

// Request logging
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

// Rate limiting — API routes
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,      // 1 minute
    max: 30,                    // 30 requests/min per IP for API routes
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute.' },
});

// Stricter limiter for generation (expensive LLM calls)
const generationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,                    // 10 generations/min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Generation rate limit exceeded. Please wait before generating again.' },
});

app.use('/api/', apiLimiter);

// ─── Service Instances ───────────────────────────────────────────────────────

const analysisService = new AnalysisService();
const projectGenerationService = new ProjectGenerationService(GENERATED_DIR);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '2.0.0',
        frameworks: ['vanilla-js', 'react', 'react-ts', 'nextjs', 'vue', 'svelte', 'angular', 'astro'],
    });
});

// Download project as ZIP
app.get('/download/:projectId', (req, res) => {
    const { projectId } = req.params;
    if (!projectId || /[^a-zA-Z0-9_-]/.test(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
    }
    const projectDir = path.join(GENERATED_DIR, projectId);
    if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
        return res.status(404).json({ error: 'Project not found' });
    }
    const zipName = `${projectId}.zip`;
    res.attachment(zipName);
    res.setHeader('Content-Type', 'application/zip');
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
        logger.error('Archive error', err);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to create archive' });
    });
    archive.pipe(res);
    archive.directory(projectDir, false);
    archive.finalize();
});

// Analyze prompt
app.post('/api/analyze', generationLimiter, async (req, res) => {
    try {
        const userPrompt = req.body?.prompt;
        if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
            return res.status(400).json({ error: 'Prompt is required and must be a non-empty string' });
        }
        if (userPrompt.length > 10000) {
            return res.status(400).json({ error: 'Prompt is too long (max 10000 characters)' });
        }
        const options = {
            framework: req.body?.framework || 'auto',
            styling: req.body?.styling || 'auto',
        };
        const result = await analysisService.analyzePrompt(userPrompt.trim(), options);
        return res.json(result);
    } catch (e) {
        logger.error(`Analyze API error: ${e.message}`);
        return res.status(500).json({ error: 'Analysis failed', details: e.message });
    }
});

// Generate plan
app.post('/api/plan', generationLimiter, async (req, res) => {
    try {
        const requirements = req.body?.requirements;
        if (!requirements || typeof requirements !== 'object') {
            return res.status(400).json({ error: 'Requirements object is required' });
        }
        const result = await analysisService.generatePlan(requirements);
        return res.json(result);
    } catch (e) {
        logger.error(`Plan API error: ${e.message}`);
        return res.status(500).json({ error: 'Planning failed', details: e.message });
    }
});

// ─── SSE — Generation with Streaming ─────────────────────────────────────────

// Track active generations per IP to prevent concurrent requests
const activeGenerations = new Map();

/** Send a named SSE event, flushing the compression buffer */
function sendSSE(res, event, data) {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
}

app.post('/api/generate', generationLimiter, async (req, res) => {
    const clientId = req.ip || 'unknown';

    // Prevent concurrent generations for same client
    if (activeGenerations.has(clientId)) {
        return res.status(409).json({ error: 'A generation is already in progress. Please wait.' });
    }

    const { prompt: userPrompt, requirements, plan } = req.body || {};

    if (!userPrompt || !requirements || !plan) {
        return res.status(400).json({ error: 'Missing required fields: prompt, requirements, or plan' });
    }

    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',   // Disable Nginx buffering if present
    });

    let cancelled = false;
    activeGenerations.set(clientId, true);

    // Client disconnect = cancel
    req.on('close', () => {
        cancelled = true;
        activeGenerations.delete(clientId);
        logger.info(`SSE client disconnected (generation cancelled): ${clientId}`);
    });

    try {
        logger.info('NEW GENERATION REQUEST', {
            userPrompt: userPrompt.substring(0, 100),
            framework: requirements.framework,
            styling: requirements.stylingFramework,
            complexity: requirements.complexity,
            fileCount: plan.files?.length
        });

        const result = await projectGenerationService.generateProject({
            userPrompt,
            requirements,
            plan,
            onProgress: (message, progress, extra) => {
                if (cancelled) return;
                sendSSE(res, 'status', { message, progress, ...extra });
            },
            onFileGenerated: (fileData) => {
                if (cancelled) return;
                sendSSE(res, 'file_generated', fileData);
            },
            onFileChunk: (chunkData) => {
                if (cancelled) return;
                sendSSE(res, 'file_chunk', chunkData);
            },
            onPlan: (planData) => {
                if (cancelled) return;
                sendSSE(res, 'generation_plan', planData);
            },
            onError: (error) => {
                if (cancelled) return;
                sendSSE(res, 'file_error', error);
            },
            onFileFixing: (fixData) => {
                if (cancelled) return;
                sendSSE(res, 'file_fixing', fixData);
            },
            onFileFixed: (fixedData) => {
                if (cancelled) return;
                sendSSE(res, 'file_fixed', fixedData);
            },
        });

        if (!cancelled) {
            sendSSE(res, 'generation_complete', {
                message: 'Project generated successfully',
                projectId: result.projectId,
                downloadUrl: result.downloadUrl,
                metrics: { duration: result.duration, filesGenerated: result.filesGenerated },
                error: null
            });
        }
    } catch (error) {
        logger.error(`Generation error: ${error.message}`, { error: error.stack });
        if (!cancelled) {
            sendSSE(res, 'generation_error', {
                error: error.message || 'Project generation failed',
                details: error.stack
            });
        }
    } finally {
        activeGenerations.delete(clientId);
        if (!res.writableEnded) res.end();
    }
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

let isShuttingDown = false;

const gracefulShutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    logger.info(`${signal} received. Shutting down gracefully...`);
    
    // Force close existing connections to allow server to close immediately
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
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
});

// ─── Start Server ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT, 10) || 5001;

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
    });
}

export { app };
