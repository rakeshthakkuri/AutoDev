
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import winston from 'winston';

// Services
import { initializeModel, generateCompletion, ANALYZER_PROMPT, PLANNER_PROMPT, CODE_GENERATOR_PROMPT } from './services/llm.js';
import { CodeValidator } from './services/validator.js';
import { getTemplate } from './services/templates.js';
import { RetryHandler } from './services/retry.js';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '../..');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'generated');
const LOG_DIR = path.join(__dirname, '../logs');

// Ensure directories exist
if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// Setup Logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: path.join(LOG_DIR, 'error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(LOG_DIR, 'app.log') }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Initialize App
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// Services Instances
const validator = new CodeValidator();
const retryHandler = new RetryHandler();

// Routes
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/api/analyze', async (req, res) => {
    try {
        const { prompt: userPrompt } = req.body;
        if (!userPrompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const prompt = ANALYZER_PROMPT.replace('{prompt}', userPrompt);
        
        try {
            const response = await generateCompletion(prompt, { maxTokens: 500, temperature: 0.1 });
            
            // Extract JSON
            let jsonStr = response;
            const match = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || response.match(/(\{[\s\S]*\})/);
            if (match) {
                jsonStr = match[1];
            }

            const result = JSON.parse(jsonStr);
            // Defaults
            result.projectType = result.projectType || 'web-app';
            result.features = result.features || ["responsive design", "modern UI"];
            result.styling = result.styling || 'modern';
            result.framework = result.framework || 'vanilla-js';
            
            res.json(result);
        } catch (e) {
            logger.error(`Analyze error: ${e.message}`);
            // Fallback
            const framework = userPrompt.toLowerCase().includes('react') ? 'react' : 'vanilla-js';
            let projectType = 'web-app';
            if (userPrompt.toLowerCase().includes('dashboard')) projectType = 'dashboard';
            else if (userPrompt.toLowerCase().includes('blog')) projectType = 'blog';
            else if (userPrompt.toLowerCase().includes('portfolio')) projectType = 'portfolio';

            res.json({
                projectType,
                features: ["responsive design", "modern UI"],
                styling: "modern",
                framework,
                isFallback: true
            });
        }
    } catch (e) {
        logger.error(`API Error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/plan', async (req, res) => {
    try {
        const { requirements } = req.body;
        if (!requirements) {
            return res.status(400).json({ error: 'Requirements are required' });
        }

        const projectType = requirements.projectType || 'web-app';
        const prompt = PLANNER_PROMPT
            .replace('{requirements}', JSON.stringify(requirements, null, 2))
            .replace('{projectType}', projectType);

        try {
            const response = await generateCompletion(prompt, { maxTokens: 800, temperature: 0.1 });
            
            let jsonStr = response;
            const match = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || response.match(/(\{[\s\S]*\})/);
            if (match) {
                jsonStr = match[1];
            }

            let result = JSON.parse(jsonStr);
            
            // Ensure HTML exists
            const hasHtml = result.files?.some(f => (f.path || f).includes('index.html'));
            if (!hasHtml) {
                if (!result.files) result.files = [];
                result.files.unshift({ path: "index.html", purpose: "Main HTML page" });
            }

            res.json(result);
        } catch (e) {
            logger.error(`Plan error: ${e.message}`);
            // Fallback
            const isReact = requirements.framework === 'react';
            res.json({
                files: isReact ? [
                    { path: "index.html", purpose: "Entry point" },
                    { path: "src/App.jsx", purpose: "Main component" },
                    { path: "src/index.css", purpose: "Styles" }
                ] : [
                    { path: "index.html", purpose: "Main page" },
                    { path: "styles.css", purpose: "Styles" },
                    { path: "script.js", purpose: "Interactivity" }
                ],
                techStack: isReact ? ["React", "Tailwind CSS"] : ["HTML", "CSS", "JavaScript"],
                isFallback: true
            });
        }
    } catch (e) {
        logger.error(`API Error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Socket.IO
io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    socket.on('generate_project', async (data) => {
        const startTime = Date.now();
        const { prompt: userPrompt, requirements, plan } = data;
        
        logger.info("NEW GENERATION REQUEST", { userPrompt });

        const projectId = `project_${Math.abs(hashString(userPrompt)) % 10000}`;
        const projectDir = path.join(GENERATED_DIR, projectId);
        
        if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true });
        }

        socket.emit('status', { message: 'Starting generation...', progress: 0 });

        const files = plan.files || [];
        const totalFiles = files.length;

        // Sort files (HTML first)
        files.sort((a, b) => {
            const pathA = (a.path || a).toLowerCase();
            const pathB = (b.path || b).toLowerCase();
            if (pathA.includes('index.html')) return -1;
            if (pathB.includes('index.html')) return 1;
            return 0;
        });

        for (let i = 0; i < totalFiles; i++) {
            // Add a small delay to ensure resources are freed
            if (i > 0) await new Promise(resolve => setTimeout(resolve, 500));

            const fileInfo = files[i];
            const filePath = typeof fileInfo === 'string' ? fileInfo : fileInfo.path;
            
            // Security check
            if (filePath.includes('..') || path.isAbsolute(filePath)) {
                logger.warn(`Invalid file path skipped: ${filePath}`);
                continue;
            }

            logger.info(`Generating file ${i+1}/${totalFiles}: ${filePath}`);
            socket.emit('status', {
                message: `Generating ${filePath}...`,
                progress: Math.floor((i / totalFiles) * 100)
            });

            const prompt = CODE_GENERATOR_PROMPT
                .replace('{userPrompt}', userPrompt)
                .replace('{projectType}', requirements.projectType || 'web-app')
                .replace('{styling}', requirements.styling || 'modern')
                .replace('{file_path}', filePath)
                .replace('{requirements}', JSON.stringify(requirements, null, 2));

            const generateFunc = async (p) => {
                try {
                    const result = await generateCompletion(p, { maxTokens: 2048, temperature: 0.3 });
                    
                    let code = result;
                    
                    // 1. Try to extract from markdown code blocks
                    const codeBlockMatch = result.match(/```(?:\w+)?\s*([\s\S]*?)```/);
                    if (codeBlockMatch) {
                        code = codeBlockMatch[1];
                    }
                    
                    // 2. Clean up markdown tags if they remain
                    code = code.replace(/```\w*\n?/g, '').replace(/```/g, '');
                    
                    // 3. File-type specific extraction
                    if (filePath.endsWith('.html')) {
                        const htmlMatch = code.match(/<!DOCTYPE\s+html>[\s\S]*<\/html>/i);
                        if (htmlMatch) {
                            code = htmlMatch[0];
                        }
                    }
                    
                    code = code.trim();
                    return { code, error: null };
                } catch (e) {
                    return { code: null, error: e.message };
                }
            };

            let code = null;
            
            // Try generation with retry
            const retryResult = await retryHandler.retryWithFeedback(generateFunc, prompt, "Previous attempt failed", filePath);
            
            if (retryResult.success) {
                code = retryResult.code;
            } else {
                logger.warn(`Generation failed for ${filePath}, using template fallback`);
                try {
                    code = getTemplate(filePath, {
                        projectType: requirements.projectType,
                        title: 'My Website',
                        description: userPrompt.substring(0, 200)
                    });
                } catch (e) {
                    logger.error(`Template fallback failed: ${e.message}`);
                    code = `// Error generating ${filePath}`;
                }
            }

            // Validation
            let validationResult = validator.validateFile(code, filePath);
            
            // Auto-fix usage
            if (validationResult.fixedCode) {
                code = validationResult.fixedCode;
                logger.info(`Auto-fixed ${filePath}: ${validationResult.fixesApplied.join(', ')}`);
            }

            // Save file
            const fullPath = path.join(projectDir, filePath);
            const dirName = path.dirname(fullPath);
            if (!fs.existsSync(dirName)) fs.mkdirSync(dirName, { recursive: true });
            
            fs.writeFileSync(fullPath, code);
            
            socket.emit('file_generated', {
                path: filePath,
                content: code,
                validation: {
                    is_valid: validationResult.isValid,
                    warnings: validationResult.warnings
                }
            });
        }

        socket.emit('generation_complete', {
            message: 'Project generated successfully',
            projectId,
            downloadUrl: `/download/${projectId}` // Not implemented yet but standard
        });
        
        const duration = (Date.now() - startTime) / 1000;
        logger.info(`Generation complete in ${duration}s`);
    });
});

// Helper
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
}

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
    logger.info(`Node.js Backend running on port ${PORT}`);
    try {
        await initializeModel();
    } catch (e) {
        logger.error("Failed to initialize model on startup", e);
    }
});
