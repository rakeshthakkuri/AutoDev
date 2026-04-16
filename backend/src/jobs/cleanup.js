/**
 * Project cleanup — no-op without a database.
 * @param {import('../services/storage/StorageService.js').StorageService} _storageService
 */
export async function runProjectCleanup(_storageService) {
    return { deleted: 0 };
}
