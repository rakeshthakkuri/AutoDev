/**
 * SSE event emitter — abstraction over Express res.write().
 * Agents emit structured events; the transport layer handles delivery.
 */
export class AgentEventEmitter {
    /**
     * @param {object} callbacks - SSE callback functions from the route handler
     * @param {Function} callbacks.onProgress - (message, progress, extra) => void
     * @param {Function} callbacks.onFileGenerated - (fileData) => void
     * @param {Function} callbacks.onFileChunk - (chunkData) => void
     * @param {Function} callbacks.onPlan - (planData) => void
     * @param {Function} callbacks.onError - (errorData) => void
     * @param {Function} callbacks.onFileFixing - (fixData) => void
     * @param {Function} callbacks.onFileFixed - (fixedData) => void
     * @param {Function} [callbacks.onEditStart] - (editData) => void
     * @param {Function} [callbacks.onEditFileUpdating] - (data) => void
     * @param {Function} [callbacks.onEditFileUpdated] - (data) => void
     * @param {Function} [callbacks.onEditComplete] - (data) => void
     */
    constructor(callbacks = {}) {
        this._callbacks = callbacks;
        this._history = [];
    }

    // ── Generation events ──

    emitProgress(message, progress, extra = {}) {
        this._emit('progress', { message, progress, ...extra });
        this._callbacks.onProgress?.(message, progress, extra);
    }

    emitPlan(planData) {
        this._emit('plan', planData);
        this._callbacks.onPlan?.(planData);
    }

    emitFileChunk(path, chunk) {
        this._callbacks.onFileChunk?.({ path, chunk });
    }

    emitFileGenerated(fileData) {
        this._emit('file_generated', fileData);
        this._callbacks.onFileGenerated?.(fileData);
    }

    emitFileFixing(fixData) {
        this._emit('file_fixing', fixData);
        this._callbacks.onFileFixing?.(fixData);
    }

    emitFileFixed(fixedData) {
        this._emit('file_fixed', fixedData);
        this._callbacks.onFileFixed?.(fixedData);
    }

    emitFileError(errorData) {
        this._emit('file_error', errorData);
        this._callbacks.onError?.(errorData);
    }

    // ── Provider-retry events (LLM transient retries) ──

    emitProviderRetry(data) {
        this._emit('provider_retry', data);
        this._callbacks.onProviderRetry?.(data);
    }

    emitProviderRecovered(data) {
        this._emit('provider_recovered', data);
        this._callbacks.onProviderRecovered?.(data);
    }

    emitGenerationDegraded(data) {
        this._emit('generation_degraded', data);
        this._callbacks.onGenerationDegraded?.(data);
    }

    // ── Edit events ──

    emitEditStart(editData) {
        this._emit('edit_start', editData);
        this._callbacks.onEditStart?.(editData);
    }

    emitEditFileUpdating(data) {
        this._emit('edit_file_updating', data);
        this._callbacks.onEditFileUpdating?.(data);
    }

    emitEditFileUpdated(data) {
        this._emit('edit_file_updated', data);
        this._callbacks.onEditFileUpdated?.(data);
    }

    emitEditComplete(data) {
        this._emit('edit_complete', data);
        this._callbacks.onEditComplete?.(data);
    }

    // ── Internal ──

    _emit(type, data) {
        this._history.push({ type, data, timestamp: Date.now() });
    }

    /**
     * Get event history (useful for debugging/testing).
     */
    getHistory() {
        return this._history;
    }
}
