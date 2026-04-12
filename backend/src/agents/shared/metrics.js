/**
 * AgentMetrics — production observability for the v2 agent pipeline.
 *
 * Tracks LLM usage, per-phase timing, per-file status, routing decisions,
 * and computes an overall quality level for each generation run.
 * No external dependencies.
 */

const PHASES = ['planning', 'generating', 'reviewing', 'fixing', 'done'];
const FILE_STATUSES = ['clean', 'fixed', 'failed', 'template'];

class AgentMetrics {
    /**
     * @param {string} generationId - Unique identifier for this generation run
     */
    constructor(generationId) {
        this.generationId = generationId;
        this.startTime = Date.now();
        this.endTime = null;

        // Event log — append-only timeline of everything that happened
        this._events = [];

        // LLM counters
        this.llmCalls = 0;
        this.llmErrors = 0;
        this.llmRetries = 0;
        this.promptTokens = 0;
        this.completionTokens = 0;

        // Per-phase timing: { [phase]: { start, end, duration } }
        this._phases = {};

        // Per-file tracking: { [path]: { attempts, fixAttempts, status, start, end, duration } }
        this._files = {};

        // Routing decisions: [{ from, to, reason, timestamp }]
        this._routing = [];
    }

    // ── Phase timing ──

    /**
     * Mark the start of a pipeline phase.
     * @param {'planning'|'generating'|'reviewing'|'fixing'|'done'} phase
     */
    startPhase(phase) {
        const now = Date.now();
        this._phases[phase] = { start: now, end: null, duration: null };
        this._log('phase_start', { phase });
    }

    /**
     * Mark the end of a pipeline phase.
     * @param {'planning'|'generating'|'reviewing'|'fixing'|'done'} phase
     */
    endPhase(phase) {
        const now = Date.now();
        const entry = this._phases[phase];
        if (entry) {
            entry.end = now;
            entry.duration = now - entry.start;
        }
        if (phase === 'done') {
            this.endTime = now;
        }
        this._log('phase_end', { phase, duration: entry?.duration ?? null });
    }

    // ── LLM tracking ──

    /**
     * Record a successful LLM call with token usage.
     * @param {string} purpose - What the call was for (e.g. 'plan', 'generate:App.jsx', 'review')
     * @param {{ prompt?: number, completion?: number }} tokens
     */
    recordLLMCall(purpose, tokens = {}) {
        this.llmCalls++;
        const prompt = tokens.prompt || 0;
        const completion = tokens.completion || 0;
        this.promptTokens += prompt;
        this.completionTokens += completion;
        this._log('llm_call', { purpose, prompt, completion });
    }

    /**
     * Record an LLM error (timeout, rate limit, invalid response, etc.).
     * @param {string} purpose - What the call was for
     * @param {string|Error} error - Error message or Error object
     */
    recordLLMError(purpose, error) {
        this.llmErrors++;
        this.llmRetries++;
        const message = error instanceof Error ? error.message : String(error);
        this._log('llm_error', { purpose, error: message });
    }

    // ── Per-file tracking ──

    /**
     * Mark generation start for a file.
     * @param {string} path - Relative file path (e.g. 'src/App.jsx')
     */
    recordFileStart(path) {
        if (!this._files[path]) {
            this._files[path] = {
                attempts: 0,
                fixAttempts: 0,
                status: null,
                start: Date.now(),
                end: null,
                duration: null,
            };
        }
        this._files[path].attempts++;
        this._files[path].start = Date.now();
        this._log('file_start', { path, attempt: this._files[path].attempts });
    }

    /**
     * Mark generation complete for a file.
     * @param {string} path - Relative file path
     * @param {'clean'|'fixed'|'failed'|'template'} status
     */
    recordFileComplete(path, status) {
        const entry = this._files[path];
        if (entry) {
            entry.status = status;
            entry.end = Date.now();
            entry.duration = entry.end - entry.start;
        }
        this._log('file_complete', { path, status, duration: entry?.duration ?? null });
    }

    /**
     * Record a fix attempt on a file.
     * @param {string} path - Relative file path
     * @param {boolean} success - Whether the fix resolved the issue
     */
    recordFixAttempt(path, success) {
        const entry = this._files[path];
        if (entry) {
            entry.fixAttempts++;
        }
        this._log('fix_attempt', { path, success, fixAttempt: entry?.fixAttempts ?? 1 });
    }

    // ── Routing decisions ──

    /**
     * Record a routing decision made by the orchestrator.
     * @param {string} from - Source agent/phase
     * @param {string} to - Target agent/phase
     * @param {string} reason - Why this routing was chosen
     */
    recordRouting(from, to, reason) {
        const entry = { from, to, reason, timestamp: Date.now() };
        this._routing.push(entry);
        this._log('routing', entry);
    }

    // ── Quality computation ──

    /**
     * Compute the overall quality level based on file outcomes.
     * @returns {'full'|'repaired'|'partial'|'degraded'}
     *
     * - full:     all files clean on first pass, no fixes needed
     * - repaired: some files needed fixes but all eventually passed
     * - partial:  most files succeeded but some failed or used templates
     * - degraded: majority of files failed or fell back to templates
     */
    computeQualityLevel() {
        const paths = Object.keys(this._files);
        if (paths.length === 0) return 'degraded';

        const total = paths.length;
        let clean = 0;
        let fixed = 0;
        let failed = 0;
        let template = 0;

        for (const path of paths) {
            const status = this._files[path].status;
            if (status === 'clean') clean++;
            else if (status === 'fixed') fixed++;
            else if (status === 'failed') failed++;
            else if (status === 'template') template++;
        }

        // All files clean — no fixes were needed
        if (clean === total) return 'full';

        // Every file either clean or successfully fixed
        if (clean + fixed === total) return 'repaired';

        // More than half succeeded (clean + fixed)
        if ((clean + fixed) / total > 0.5) return 'partial';

        return 'degraded';
    }

    // ── Summary ──

    /**
     * Generate a summary object with all collected metrics.
     * Suitable for logging, storage, or API response.
     */
    toSummary() {
        const now = Date.now();
        const totalDuration = (this.endTime || now) - this.startTime;

        // Aggregate file statuses
        const fileSummary = {};
        for (const [path, entry] of Object.entries(this._files)) {
            fileSummary[path] = {
                status: entry.status,
                attempts: entry.attempts,
                fixAttempts: entry.fixAttempts,
                duration: entry.duration,
            };
        }

        // Aggregate phase durations
        const phaseSummary = {};
        for (const [phase, entry] of Object.entries(this._phases)) {
            phaseSummary[phase] = {
                duration: entry.duration ?? (entry.start ? now - entry.start : null),
                started: !!entry.start,
                completed: !!entry.end,
            };
        }

        // File status counts
        const fileStatusCounts = { clean: 0, fixed: 0, failed: 0, template: 0 };
        for (const entry of Object.values(this._files)) {
            if (entry.status && fileStatusCounts[entry.status] !== undefined) {
                fileStatusCounts[entry.status]++;
            }
        }

        return {
            generationId: this.generationId,
            quality: this.computeQualityLevel(),
            duration: totalDuration,

            llm: {
                calls: this.llmCalls,
                errors: this.llmErrors,
                retries: this.llmRetries,
                promptTokens: this.promptTokens,
                completionTokens: this.completionTokens,
                totalTokens: this.promptTokens + this.completionTokens,
            },

            files: {
                total: Object.keys(this._files).length,
                ...fileStatusCounts,
                details: fileSummary,
            },

            phases: phaseSummary,
            routing: this._routing,
            eventCount: this._events.length,
        };
    }

    // ── Internal ──

    /**
     * Append a timestamped event to the log.
     * @param {string} type
     * @param {object} data
     */
    _log(type, data) {
        this._events.push({ type, data, timestamp: Date.now() });
    }

    /**
     * Get the raw event log (useful for debugging or detailed audit).
     */
    getEvents() {
        return this._events;
    }
}

export { AgentMetrics };
