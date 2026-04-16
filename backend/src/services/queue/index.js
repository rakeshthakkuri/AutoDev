// Job queue removed — database (pg-boss) dependency eliminated.
// The application processes all generation requests synchronously in-process.

const QUEUE_NAME = 'generation';

export function isQueueReady() {
    return false;
}

export async function initQueue() {
    return null;
}

export async function enqueueGeneration() {
    throw new Error('Queue not available');
}

export async function startWorker() {}

export async function getJobStatus() {
    return null;
}

export async function stopQueue() {}

export { QUEUE_NAME };
