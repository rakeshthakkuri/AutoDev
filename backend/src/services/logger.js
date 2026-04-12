// ═══════════════════════════════════════════════════════════════════════════════
// Shared logger — single Winston instance used by all services
// ═══════════════════════════════════════════════════════════════════════════════

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import config from '../config.js';
import { requestContext } from '../middleware/requestId.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.resolve(__dirname, '../../logs');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const { level, maxFileSize, maxFiles } = config.logging;

const logger = winston.createLogger({
    level,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format((info) => {
            const ctx = requestContext.getStore();
            if (ctx?.requestId) info.requestId = ctx.requestId;
            return info;
        })(),
        winston.format.json(),
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(LOG_DIR, 'error.log'),
            level: 'error',
            maxsize: maxFileSize,
            maxFiles,
        }),
        new winston.transports.File({
            filename: path.join(LOG_DIR, 'app.log'),
            maxsize: maxFileSize,
            maxFiles: maxFiles + 2,
        }),
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
    ],
});

export default logger;
