import { query } from '../db/index.js';
import config from '../config.js';
import logger from '../services/logger.js';

/**
 * Remove old generated projects and stale pending rows.
 * @param {import('../services/storage/StorageService.js').StorageService} storageService
 */
export async function runProjectCleanup(storageService) {
    if (!config.databaseUrl) return { deleted: 0 };

    const days = config.projectRetentionDays || 7;
    let deleted = 0;

    const { rows } = await query(
        `SELECT job_id, storage_path
         FROM projects
         WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
           AND status IN ('complete', 'failed')`,
        [days],
    );

    for (const row of rows) {
        try {
            if (row.storage_path) {
                await storageService.deleteProject(row.storage_path);
            }
            await query(`DELETE FROM projects WHERE job_id = $1`, [row.job_id]);
            deleted += 1;
        } catch (e) {
            logger.warn('Cleanup row failed', { jobId: row.job_id, error: e.message });
        }
    }

    const stale = await query(
        `DELETE FROM projects
         WHERE status = 'pending'
           AND created_at < NOW() - INTERVAL '48 hours'
         RETURNING job_id`,
    );
    deleted += stale.rowCount || 0;

    if (deleted) {
        logger.info('Project cleanup finished', { deleted });
    }
    return { deleted };
}
