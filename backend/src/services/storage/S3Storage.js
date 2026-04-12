import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { StorageService } from './StorageService.js';
import logger from '../logger.js';

export class S3Storage extends StorageService {
    constructor(cfg) {
        super();
        this.bucket = cfg.s3Bucket;
        this.prefix = cfg.s3Prefix || 'projects';
        this.client = new S3Client({
            region: cfg.s3Region || 'us-east-1',
            endpoint: cfg.s3Endpoint || undefined,
            credentials: (cfg.awsAccessKeyId && cfg.awsSecretAccessKey) ? {
                accessKeyId: cfg.awsAccessKeyId,
                secretAccessKey: cfg.awsSecretAccessKey,
            } : undefined,
        });
    }

    _key(projectId, relativePath) {
        return `${this.prefix}/${projectId}/${relativePath}`;
    }

    _contentType(filename) {
        const ext = filename.split('.').pop()?.toLowerCase();
        const types = {
            js: 'application/javascript', jsx: 'application/javascript',
            ts: 'application/typescript', tsx: 'application/typescript',
            html: 'text/html', css: 'text/css',
            json: 'application/json', md: 'text/markdown',
            svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
        };
        return types[ext] || 'text/plain';
    }

    ensureProject() { /* no-op for S3 */ }

    async writeFile(projectId, relativePath, content) {
        await this.client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: this._key(projectId, relativePath),
            Body: content,
            ContentType: this._contentType(relativePath),
        }));
        logger.debug('S3 writeFile', { projectId, path: relativePath });
    }

    async readFile(projectId, relativePath) {
        const response = await this.client.send(new GetObjectCommand({
            Bucket: this.bucket,
            Key: this._key(projectId, relativePath),
        }));
        return response.Body.transformToString('utf8');
    }

    async listFiles(projectId) {
        const prefix = `${this.prefix}/${projectId}/`;
        const files = [];
        let continuationToken;

        do {
            const response = await this.client.send(new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            }));
            for (const obj of response.Contents || []) {
                files.push(obj.Key.replace(prefix, ''));
            }
            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        return files;
    }

    async deleteProject(projectId) {
        const files = await this.listFiles(projectId);
        if (!files.length) return;

        for (let i = 0; i < files.length; i += 1000) {
            const batch = files.slice(i, i + 1000);
            await this.client.send(new DeleteObjectsCommand({
                Bucket: this.bucket,
                Delete: { Objects: batch.map(f => ({ Key: this._key(projectId, f) })) },
            }));
        }
    }

    async projectExists(projectId) {
        try {
            const files = await this.listFiles(projectId);
            return files.length > 0;
        } catch {
            return false;
        }
    }

    getProjectDir(projectId) {
        return `s3://${this.bucket}/${this.prefix}/${projectId}`;
    }
}
