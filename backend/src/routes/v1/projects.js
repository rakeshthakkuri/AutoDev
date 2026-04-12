import express from 'express';
import { query } from '../../db/index.js';
import config from '../../config.js';
import { authenticate } from '../../middleware/authenticate.js';
import { Errors } from '../../utils/errors.js';

/**
 * @param {{ storageService: import('../../services/storage/StorageService.js').StorageService }} deps
 */
export function createV1ProjectsRouter({ storageService }) {
    const router = express.Router();

    router.use(authenticate);

    router.get('/', async (req, res, next) => {
        try {
            if (!config.databaseUrl) {
                return res.json({ items: [], total: 0, limit: 20, offset: 0 });
            }
            const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
            const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
            const { rows: countRows } = await query(
                `SELECT COUNT(*)::int AS c FROM projects WHERE user_id = $1`,
                [req.user.id],
            );
            const total = countRows[0]?.c ?? 0;
            const { rows } = await query(
                `SELECT job_id, status, prompt, progress, files_generated, total_files,
                        storage_path, created_at, updated_at, error_message
                 FROM projects
                 WHERE user_id = $1
                 ORDER BY created_at DESC
                 LIMIT $2 OFFSET $3`,
                [req.user.id, limit, offset],
            );
            const items = rows.map(r => ({
                jobId: r.job_id,
                status: r.status,
                prompt: r.prompt,
                progress: r.progress,
                filesGenerated: r.files_generated,
                totalFiles: r.total_files,
                storagePath: r.storage_path,
                downloadUrl: r.storage_path ? `/download/${r.storage_path}` : null,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                errorMessage: r.error_message,
            }));
            res.set('API-Version', 'v1');
            return res.json({ items, total, limit, offset });
        } catch (e) {
            next(e);
        }
    });

    router.get('/:jobId', async (req, res, next) => {
        try {
            if (!config.databaseUrl) return next(Errors.notFound('Project not found'));
            const { rows } = await query(
                `SELECT * FROM projects WHERE job_id = $1 AND user_id = $2`,
                [req.params.jobId, req.user.id],
            );
            const r = rows[0];
            if (!r) return next(Errors.notFound('Project not found'));
            res.set('API-Version', 'v1');
            return res.json({
                jobId: r.job_id,
                status: r.status,
                prompt: r.prompt,
                progress: r.progress,
                filesGenerated: r.files_generated,
                totalFiles: r.total_files,
                storagePath: r.storage_path,
                downloadUrl: r.storage_path ? `/download/${r.storage_path}` : null,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                errorMessage: r.error_message,
            });
        } catch (e) {
            next(e);
        }
    });

    router.delete('/:jobId', async (req, res, next) => {
        try {
            if (!config.databaseUrl) return next(Errors.notFound('Project not found'));
            const { rows } = await query(
                `SELECT job_id, storage_path FROM projects WHERE job_id = $1 AND user_id = $2`,
                [req.params.jobId, req.user.id],
            );
            const row = rows[0];
            if (!row) return next(Errors.notFound('Project not found'));
            if (row.storage_path) {
                await storageService.deleteProject(row.storage_path);
            }
            await query(`DELETE FROM projects WHERE job_id = $1`, [row.job_id]);
            res.set('API-Version', 'v1');
            return res.json({ ok: true });
        } catch (e) {
            next(e);
        }
    });

    return router;
}
