import express from 'express';
import path from 'path';
import { createZip, zipDirectory } from '../services/zipper.js';
import logger from '../services/logger.js';
import { Errors } from '../utils/errors.js';
import { LocalStorage } from '../services/storage/LocalStorage.js';

function sanitizeFilename(name) {
    return name.replace(/[^\w.\-]/g, '_').substring(0, 100) || 'project';
}

/**
 * @param {import('../services/storage/StorageService.js').StorageService} storageService
 */
export function createDownloadRouter(storageService) {
    const router = express.Router();

    router.get('/:projectId', async (req, res, next) => {
        try {
            const { projectId } = req.params;

            if (
                !projectId ||
                typeof projectId !== 'string' ||
                projectId.length > 128 ||
                projectId.includes('..') ||
                projectId.includes('/') ||
                projectId.includes('\\')
            ) {
                return next(Errors.badRequest('Invalid project ID format'));
            }

            if (!(await storageService.projectExists(projectId))) {
                return next(Errors.notFound('Project not found'));
            }

            let zipBuffer;
            if (storageService instanceof LocalStorage) {
                zipBuffer = await zipDirectory(storageService.getProjectDir(projectId));
            } else {
                const rels = await storageService.listFiles(projectId);
                const files = {};
                for (const rel of rels) {
                    files[rel] = await storageService.readFile(projectId, rel);
                }
                zipBuffer = await createZip(files);
            }

            const safeFilename = sanitizeFilename(projectId);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.zip"`);
            res.send(zipBuffer);
        } catch (error) {
            logger.error('Project download error:', error);
            next(error);
        }
    });

    router.post('/zip', async (req, res, next) => {
        try {
            const { files, filename = 'project.zip' } = req.body;

            if (!files || typeof files !== 'object' || Array.isArray(files)) {
                return next(Errors.badRequest('Files are required and must be an object'));
            }

            const MAX_FILES = 200;
            const entries = Object.entries(files);
            if (entries.length > MAX_FILES) {
                return next(Errors.badRequest(`Too many files (max ${MAX_FILES})`));
            }

            const sanitizedFiles = {};
            for (const [filePath, content] of entries) {
                if (typeof filePath !== 'string' || filePath.includes('..') || path.isAbsolute(filePath)) {
                    return next(Errors.badRequest(`Invalid file path: ${filePath}`));
                }
                if (typeof content !== 'string') {
                    return next(Errors.badRequest(`File content must be a string: ${filePath}`));
                }
                sanitizedFiles[filePath] = content;
            }

            const zipBuffer = await createZip(sanitizedFiles);
            const safeFilename = sanitizeFilename(String(filename).replace(/\.zip$/i, ''));

            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.zip"`);
            res.send(zipBuffer);
        } catch (error) {
            logger.error('ZIP creation error:', error);
            next(error);
        }
    });

    return router;
}
