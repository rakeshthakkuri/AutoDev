import 'dotenv/config';
import config from '../config.js';
import logger from '../services/logger.js';
import { initializeModel } from '../services/llm.js';
import { initQueue, startWorker } from '../services/queue/index.js';
import { processGeneration } from '../services/queue/processors/generation.processor.js';

async function main() {
    if (!config.databaseUrl) {
        logger.error('DATABASE_URL is required for the generation worker');
        process.exit(1);
    }
    try {
        await initializeModel();
    } catch (e) {
        logger.error('Failed to initialize model', e);
    }
    await initQueue();
    await startWorker(processGeneration);
    logger.info('Generation worker process running');
}

main().catch(err => {
    logger.error('Worker fatal error', { error: err.message, stack: err.stack });
    process.exit(1);
});
