import express from 'express';
import logger from '../services/logger.js';

const MAX_ENTRIES = 100;
const memStore = [];

/**
 * Record a generation result for in-memory metrics tracking.
 * @param {object} record
 */
export async function recordGeneration(record) {
    memStore.push({
        ...record,
        timestamp: new Date().toISOString(),
    });
    while (memStore.length > MAX_ENTRIES) memStore.shift();
}

export function createMetricsRouter() {
    const router = express.Router();

    router.get('/generations', (req, res) => {
        const windowHours = req.query.hours ? parseInt(String(req.query.hours), 10) : 24;
        const avg = (arr, key) => {
            const vals = arr.map(e => e[key]).filter(v => typeof v === 'number');
            return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
        };
        const successRate = (arr) => {
            if (arr.length === 0) return 0;
            return Math.round(arr.filter(e => e.quality !== 'failed' && e.quality !== 'degraded').length / arr.length * 100) / 100;
        };
        res.json({
            windowHours,
            agentVersion: 'v2',
            summary: {
                total: memStore.length,
                successful: memStore.filter(e => e.quality !== 'failed').length,
                failed: memStore.filter(e => e.quality === 'failed').length,
                successRate: memStore.length ? `${Math.round(successRate(memStore) * 100)}%` : 'N/A',
                avgDurationMs: avg(memStore, 'duration'),
                avgFileCount: avg(memStore, 'fileCount'),
                lastGenerationAt: memStore.length ? memStore[memStore.length - 1].timestamp : null,
            },
            recent: memStore.slice(-20).reverse(),
        });
    });

    router.get('/quality', (_req, res) => {
        res.json({
            message: 'Quality aggregates require a database',
            last7Days: null,
            dailyBreakdown: [],
        });
    });

    return router;
}
