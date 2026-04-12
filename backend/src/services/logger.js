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

const logToFiles =
    process.env.LOG_TO_FILES === '1' ||
    process.env.LOG_TO_FILES === 'true' ||
    !config.isProd;

if (logToFiles && !fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const { level, maxFileSize, maxFiles } = config.logging;

const baseFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format((info) => {
        const ctx = requestContext.getStore();
        if (ctx?.requestId) info.requestId = ctx.requestId;
        return info;
    })(),
    winston.format.json(),
);

const transports = [];

if (logToFiles) {
    transports.push(
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
    );
}

transports.push(
    new winston.transports.Console({
        format: config.isProd
            ? winston.format.combine(
                  winston.format.timestamp(),
                  winston.format((info) => {
                      const ctx = requestContext.getStore();
                      if (ctx?.requestId) info.requestId = ctx.requestId;
                      return info;
                  })(),
                  winston.format.json(),
              )
            : winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
);

const logger = winston.createLogger({
    level,
    format: baseFormat,
    transports,
});

export default logger;
