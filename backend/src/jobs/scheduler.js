import config from '../config.js';
import logger from '../services/logger.js';
import { runProjectCleanup } from './cleanup.js';

let intervalId = null;
let bootTimer = null;

/**
 * @param {import('../services/storage/StorageService.js').StorageService} storageService
 */
export function startScheduler(storageService) {
    const hours = config.cleanupIntervalHours || 24;
    const ms = hours * 60 * 60 * 1000;

    bootTimer = setTimeout(async () => {
        try {
            await runProjectCleanup(storageService);
        } catch (e) {
            logger.error('Initial cleanup failed', { error: e.message });
        }
    }, 30_000);

    intervalId = setInterval(async () => {
        try {
            await runProjectCleanup(storageService);
        } catch (e) {
            logger.error('Scheduled cleanup failed', { error: e.message });
        }
    }, ms);

    logger.info('Cleanup scheduler started', { intervalHours: hours });
}

export function stopScheduler() {
    if (bootTimer) clearTimeout(bootTimer);
    if (intervalId) clearInterval(intervalId);
    bootTimer = null;
    intervalId = null;
}
