import express from 'express';
import { query } from '../db/index.js';
import config from '../config.js';
import logger from '../services/logger.js';

const MAX_ENTRIES = 100;
const memStore = [];

/**
 * Record a generation result for metrics tracking.
 * @param {object} record
 */
export async function recordGeneration(record) {
    const jobId = record.generationId || record.jobId;
    const success = record.quality !== 'failed' && record.quality !== 'degraded';

    if (config.databaseUrl) {
        try {
            await query(`
              INSERT INTO generation_events
                (project_id, job_id, llm_provider, agent_version, duration_ms, file_count, success, error_type, tokens_used,
                 import_errors_initial, import_errors_remaining, missing_packages, repair_passes, fully_validated)
              VALUES (
                (SELECT id FROM projects WHERE job_id = $1 LIMIT 1),
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
              )
            `, [
                jobId,
                record.llmProvider || 'gemini',
                record.agentVersion || 'v2',
                record.duration ?? record.durationMs ?? null,
                record.fileCount ?? null,
                success,
                success ? null : (record.quality || record.errorType || null),
                record.tokensUsed ?? null,
                record.validationErrors ?? 0,
                record.remainingErrors ?? 0,
                record.missingPackages ?? 0,
                record.repairPassesNeeded ?? 0,
                record.fullyValidated ?? (success && (record.remainingErrors === 0)),
            ]);
        } catch (err) {
            logger.error('Failed to record generation event', { error: err.message, jobId });
        }
        return;
    }

    memStore.push({
        ...record,
        timestamp: new Date().toISOString(),
    });
    while (memStore.length > MAX_ENTRIES) memStore.shift();
}

export function createMetricsRouter() {
    const router = express.Router();

    router.get('/generations', async (req, res, next) => {
        try {
            const windowHours = req.query.hours ? parseInt(String(req.query.hours), 10) : 24;

            if (!config.databaseUrl) {
                const avg = (arr, key) => {
                    const vals = arr.map(e => e[key]).filter(v => typeof v === 'number');
                    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
                };
                const successRate = (arr) => {
                    if (arr.length === 0) return 0;
                    const successes = arr.filter(e => e.quality !== 'failed' && e.quality !== 'degraded');
                    return Math.round(successes.length / arr.length * 100) / 100;
                };
                const bundleRate = (arr) => {
                    if (arr.length === 0) return 0;
                    const ok = arr.filter(e => e.bundleSuccess);
                    return Math.round(ok.length / arr.length * 100) / 100;
                };
                return res.json({
                    windowHours,
                    agentVersion: 'v2',
                    summary: {
                        total: memStore.length,
                        successful: memStore.filter(e => e.quality !== 'failed').length,
                        failed: memStore.filter(e => e.quality === 'failed').length,
                        successRate: memStore.length ? 'N/A' : 'N/A',
                        avgDurationMs: null,
                        avgFileCount: null,
                        lastGenerationAt: null,
                    },
                    recent: memStore.slice(-20).reverse(),
                    inMemoryFallback: {
                        totalGenerations: memStore.length,
                        averageScores: {
                            duration: avg(memStore, 'duration'),
                            fileSuccessRate: successRate(memStore),
                            bundleSuccessRate: bundleRate(memStore),
                        },
                    },
                });
            }

            const [summaryResult, recentResult] = await Promise.all([
                query(`
                  SELECT
                    COUNT(*)::int                                              AS total,
                    COUNT(*) FILTER (WHERE success = TRUE)::int               AS successful,
                    COUNT(*) FILTER (WHERE success = FALSE)::int              AS failed,
                    ROUND(AVG(duration_ms) FILTER (WHERE success = TRUE))::int AS avg_duration_ms,
                    ROUND(AVG(file_count))::int                                AS avg_file_count,
                    MAX(created_at)                                           AS last_generation_at
                  FROM generation_events
                  WHERE created_at > NOW() - ($1 * INTERVAL '1 hour')
                `, [String(windowHours)]),
                query(`
                  SELECT job_id, llm_provider, agent_version, duration_ms,
                         file_count, success, error_type, created_at
                  FROM generation_events
                  ORDER BY created_at DESC
                  LIMIT 20
                `),
            ]);

            const summary = summaryResult.rows[0];
            const total = parseInt(summary.total, 10) || 0;
            const successful = parseInt(summary.successful, 10) || 0;

            res.json({
                windowHours,
                summary: {
                    total,
                    successful,
                    failed: parseInt(summary.failed, 10) || 0,
                    successRate: total > 0 ? `${Math.round((successful / total) * 100)}%` : 'N/A',
                    avgDurationMs: summary.avg_duration_ms,
                    avgFileCount: summary.avg_file_count,
                    lastGenerationAt: summary.last_generation_at,
                },
                recent: recentResult.rows,
            });
        } catch (err) {
            next(err);
        }
    });

    router.get('/quality', async (req, res, next) => {
        try {
            if (!config.databaseUrl) {
                return res.json({
                    message: 'Database not configured — quality aggregates unavailable',
                    last7Days: null,
                    dailyBreakdown: [],
                });
            }
            const [quality, totals] = await Promise.all([
                query('SELECT * FROM generation_quality LIMIT 14'),
                query(`
                  SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE fully_validated = TRUE)::int AS fully_clean,
                    ROUND(AVG(import_errors_initial)::numeric, 2) AS avg_initial_errors,
                    ROUND(AVG(import_errors_remaining)::numeric, 2) AS avg_remaining_errors,
                    ROUND(100.0 * COUNT(*) FILTER (WHERE fully_validated = TRUE) / NULLIF(COUNT(*), 0), 2) AS clean_rate_pct
                  FROM generation_events
                  WHERE success = TRUE
                    AND created_at > NOW() - INTERVAL '7 days'
                `),
            ]);

            res.json({
                last7Days: totals.rows[0],
                dailyBreakdown: quality.rows,
                target: { cleanRatePct: 90, description: 'Target: 90% of generations fully validated after repair' },
            });
        } catch (err) {
            next(err);
        }
    });

    return router;
}
