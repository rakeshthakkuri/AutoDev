import fs from 'fs';
import path from 'path';
import { StorageService } from './StorageService.js';

export class LocalStorage extends StorageService {
    constructor(baseDir) {
        super();
        this.baseDir = baseDir;
    }

    _projectPath(projectId) {
        return path.join(this.baseDir, projectId);
    }

    _filePath(projectId, relativePath) {
        const resolved = path.resolve(this._projectPath(projectId), relativePath);
        const base = path.resolve(this._projectPath(projectId));
        if (!resolved.startsWith(base + path.sep) && resolved !== base) {
            throw new Error(`Path traversal detected: ${relativePath}`);
        }
        return resolved;
    }

    ensureProject(projectId) {
        fs.mkdirSync(this._projectPath(projectId), { recursive: true });
    }

    async writeFile(projectId, relativePath, content) {
        const filePath = this._filePath(projectId, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }

    async readFile(projectId, relativePath) {
        return fs.readFileSync(this._filePath(projectId, relativePath), 'utf8');
    }

    async listFiles(projectId) {
        const dir = this._projectPath(projectId);
        if (!fs.existsSync(dir)) return [];
        const results = [];
        function walk(current, rel) {
            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
                const relPath = rel ? `${rel}/${entry.name}` : entry.name;
                if (entry.isDirectory()) walk(path.join(current, entry.name), relPath);
                else results.push(relPath.split(path.sep).join('/'));
            }
        }
        walk(dir, '');
        return results;
    }

    async deleteProject(projectId) {
        const dir = this._projectPath(projectId);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }

    async projectExists(projectId) {
        return fs.existsSync(this._projectPath(projectId));
    }

    getProjectDir(projectId) {
        return this._projectPath(projectId);
    }
}
