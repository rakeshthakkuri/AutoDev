import path from 'path';
import { fileURLToPath } from 'url';
import { LocalStorage } from './LocalStorage.js';
import config from '../../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve generated directory relative to backend package root (parent of src/).
 */
function resolveGeneratedBase() {
    const backendRoot = path.join(__dirname, '..', '..');
    const rel = config.generatedDir || 'generated';
    return path.isAbsolute(rel) ? rel : path.join(backendRoot, rel);
}

/**
 * @returns {Promise<import('./StorageService.js').StorageService>}
 */
export async function createStorageService() {
    const baseDir = resolveGeneratedBase();
    if (config.storageProvider === 's3') {
        if (!config.s3Bucket) throw new Error('S3_BUCKET required when STORAGE_PROVIDER=s3');
        const { S3Storage } = await import('./S3Storage.js');
        return new S3Storage(config);
    }
    return new LocalStorage(baseDir);
}

export { StorageService } from './StorageService.js';
export { LocalStorage } from './LocalStorage.js';
export { S3Storage } from './S3Storage.js';
