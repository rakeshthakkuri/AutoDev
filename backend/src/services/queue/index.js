import { PgBoss } from 'pg-boss';
import config from '../../config.js';
import logger from '../logger.js';

const QUEUE_NAME = 'generation';

let boss = null;

export function isQueueReady() {
    return boss !== null;
}

export async function initQueue() {
    if (!config.databaseUrl) {
        logger.warn('Job queue skipped — DATABASE_URL not set');
        return null;
    }
    if (boss) return boss;

    boss = new PgBoss({
        connectionString: config.databaseUrl,
        archiveCompletedAfterSeconds: 86_400,
        deleteAfterSeconds: 604_800,
        monitorStateIntervalSeconds: 2,
        retryBackoff: true,
    });

    boss.on('error', err => logger.error('pg-boss error', { error: err.message }));

    await boss.start();
    await boss.createQueue(QUEUE_NAME);
    logger.info('Job queue started (pg-boss)');
    return boss;
}

export async function enqueueGeneration(jobId, payload) {
    if (!boss) throw new Error('Queue not initialized. Call initQueue() first.');
    const id = await boss.send(QUEUE_NAME, { jobId, ...payload }, {
        retryLimit: 2,
        retryDelay: 10,
        expireInMinutes: 60,
    });
    logger.info('Generation job enqueued', { jobId, pgBossId: id });
    return id;
}

/**
 * @param {(job: import('pg-boss').JobWithMetadata) => Promise<void>} handler
 */
export async function startWorker(handler) {
    if (!boss) throw new Error('Queue not initialized. Call initQueue() first.');
    const concurrency = config.queueConcurrency || 3;
    await boss.work(QUEUE_NAME, { teamConcurrency: concurrency }, async ([job]) => {
        await handler(job);
    });
    logger.info('Generation worker registered', { concurrency });
}

export async function getJobStatus(jobId) {
    if (!boss) return null;
    const job = await boss.getJobById(QUEUE_NAME, jobId);
    if (!job) return null;
    return {
        id: job.id,
        state: job.state,
        progress: job.output?.progress ?? null,
        startedAt: job.startedOn,
        completedAt: job.completedOn,
        output: job.output,
        retryCount: job.retryCount,
    };
}

export async function stopQueue() {
    if (boss) {
        await boss.stop();
        boss = null;
    }
}

export { QUEUE_NAME };
