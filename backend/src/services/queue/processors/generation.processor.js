import { updateGenerationRecord } from '../../generationStore.js';
import { recordGeneration } from '../../../routes/metrics.js';
import { ProjectGenerationService } from '../../projectGeneration.js';
import { createStorageService } from '../../storage/index.js';
import { AnalysisService } from '../../analysis.js';
import config from '../../../config.js';
import logger from '../../logger.js';

let _generationService = null;
let _analysisService = null;

async function getGenerationService() {
    if (_generationService) return { generationService: _generationService, analysisService: _analysisService };
    const storage = await createStorageService();
    _analysisService = new AnalysisService();
    _generationService = new ProjectGenerationService(config.generatedDir, storage);
    _generationService._analysisService = _analysisService;
    return { generationService: _generationService, analysisService: _analysisService };
}

/**
 * @param {import('pg-boss').JobWithMetadata} job
 */
export async function processGeneration(job) {
    const data = job.data || {};
    const {
        jobId,
        userPrompt,
        requirements,
        plan,
        userId,
        apiKeyId,
    } = data;

    const generationId = jobId;
    const startTime = Date.now();
    const total = Array.isArray(plan?.files) ? plan.files.length : 0;
    let filesDone = 0;

    logger.info('Processing generation job', { jobId, files: total });

    try {
        await updateGenerationRecord(jobId, { status: 'generating' });

        const { generationService } = await getGenerationService();

        const result = await generationService.generateProject({
            generationId,
            userPrompt,
            requirements,
            plan,
            onProgress: () => {},
            onFileGenerated: async () => {
                filesDone += 1;
                await updateGenerationRecord(jobId, {
                    filesGenerated: filesDone,
                    totalFiles: total,
                    status: 'generating',
                    progress: total ? Math.round((filesDone / total) * 100) : 0,
                });
            },
        });

        await updateGenerationRecord(jobId, {
            status: 'complete',
            progress: 100,
            storagePath: result.projectId,
        });

        if (result.metricsRecord) {
            await recordGeneration(result.metricsRecord);
        }

        // Usage events require a database — skipped.

        logger.info('Generation job complete', { jobId, durationMs: Date.now() - startTime });
        return { jobId, success: true };
    } catch (err) {
        logger.error('Generation job failed', { jobId, error: err.message });
        await updateGenerationRecord(jobId, { status: 'failed', errorMessage: err.message });
        if (err.metricsRecord) {
            await recordGeneration(err.metricsRecord);
        }
        throw err;
    }
}
