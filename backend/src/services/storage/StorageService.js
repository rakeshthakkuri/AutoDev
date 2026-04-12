/** Abstract interface — all storage backends implement these methods */
export class StorageService {
    async writeFile(projectId, relativePath, content) { throw new Error('Not implemented'); }
    async readFile(projectId, relativePath) { throw new Error('Not implemented'); }
    async listFiles(projectId) { throw new Error('Not implemented'); }
    async deleteProject(projectId) { throw new Error('Not implemented'); }
    async projectExists(projectId) { throw new Error('Not implemented'); }
    getProjectDir(projectId) { throw new Error('Not implemented'); }
    ensureProject(projectId) { throw new Error('Not implemented'); }
}
