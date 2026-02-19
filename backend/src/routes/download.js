import express from 'express';
import path from 'path';
import fs from 'fs';
import { createZip, zipDirectory } from '../services/zipper.js';
import logger from '../services/logger.js';

// Validate that a resolved path stays within the allowed base directory
function isWithinDir(base, target) {
    const resolvedBase = path.resolve(base);
    const resolvedTarget = path.resolve(target);
    return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
}

// Sanitize a filename for use in Content-Disposition header
function sanitizeFilename(name) {
    return name.replace(/[^\w.\-]/g, '_').substring(0, 100) || 'project';
}

export function createDownloadRouter(generatedDir) {
    const router = express.Router();

    // GET /download/:projectId - Download a previously generated project from disk
    router.get('/:projectId', async (req, res) => {
        try {
            const { projectId } = req.params;

            // Validate projectId format — must be project_ followed by hex chars
            if (!/^project_[a-f0-9]{1,16}$/i.test(projectId)) {
                return res.status(400).json({ error: 'Invalid project ID format' });
            }

            const projectDir = path.join(generatedDir, projectId);

            // Guard against path traversal
            if (!isWithinDir(generatedDir, projectDir)) {
                logger.warn(`Path traversal attempt blocked: ${projectId}`);
                return res.status(403).json({ error: 'Access denied' });
            }

            if (!fs.existsSync(projectDir)) {
                return res.status(404).json({ error: 'Project not found' });
            }

            const zipBuffer = await zipDirectory(projectDir);
            const safeFilename = sanitizeFilename(projectId);

            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.zip"`);
            res.send(zipBuffer);
        } catch (error) {
            logger.error('Project download error:', error);
            res.status(500).json({ error: 'Internal server error during project download' });
        }
    });

    // POST /download/zip - Create and download a ZIP from provided file map (in-memory)
    router.post('/zip', async (req, res) => {
        try {
            const { files, filename = 'project.zip' } = req.body;

            if (!files || typeof files !== 'object' || Array.isArray(files)) {
                return res.status(400).json({ error: 'Files are required and must be an object' });
            }

            // Validate all file paths to prevent path traversal in the ZIP
            const MAX_FILES = 200;
            const entries = Object.entries(files);
            if (entries.length > MAX_FILES) {
                return res.status(400).json({ error: `Too many files (max ${MAX_FILES})` });
            }

            const sanitizedFiles = {};
            for (const [filePath, content] of entries) {
                if (typeof filePath !== 'string' || filePath.includes('..') || path.isAbsolute(filePath)) {
                    return res.status(400).json({ error: `Invalid file path: ${filePath}` });
                }
                if (typeof content !== 'string') {
                    return res.status(400).json({ error: `File content must be a string: ${filePath}` });
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
            res.status(500).json({ error: 'Internal server error during ZIP creation' });
        }
    });

    return router;
}
