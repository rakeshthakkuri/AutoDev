import archiver from 'archiver';
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';

/**
 * Creates a ZIP buffer from a map of files.
 * @param {Record<string, string>} files Map of path to content
 * @returns {Promise<Buffer>} ZIP file as buffer
 */
export async function createZip(files) {
    return new Promise((resolve, reject) => {
        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });
        const chunks = [];

        archive.on('data', (chunk) => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', (err) => reject(err));

        for (const [path, content] of Object.entries(files)) {
            archive.append(content, { name: path });
        }

        archive.finalize();
    });
}

/**
 * Creates a ZIP buffer from a directory.
 * @param {string} dirPath Path to the directory
 * @returns {Promise<Buffer>} ZIP file as buffer
 */
export async function zipDirectory(dirPath) {
    return new Promise((resolve, reject) => {
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });
        const chunks = [];

        archive.on('data', (chunk) => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', (err) => reject(err));

        archive.directory(dirPath, false);
        archive.finalize();
    });
}
