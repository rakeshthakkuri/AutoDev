// ═══════════════════════════════════════════════════════════════════════════════
// Live Test Runner — Real Gemini API calls through the actual Express server
// No mocking. Requires GEMINI_API_KEY in .env.
// ═══════════════════════════════════════════════════════════════════════════════

import http from 'http';
import { once } from 'events';
import { extractContracts } from '../../src/agents/shared/contracts.js';

const BASE_DIR = new URL('../../', import.meta.url).pathname;

// ─── SSE Parser ──────────────────────────────────────────────────────────────

function parseSSEStream(rawText) {
    const events = [];
    const lines = rawText.split('\n');
    let currentEvent = null;
    let dataBuffer = '';

    for (const line of lines) {
        if (line.startsWith('event: ')) {
            if (currentEvent && dataBuffer) {
                try {
                    events.push({ type: currentEvent, data: JSON.parse(dataBuffer), raw: dataBuffer });
                } catch {
                    events.push({ type: currentEvent, data: null, raw: dataBuffer, parseError: true });
                }
            }
            currentEvent = line.slice(7).trim();
            dataBuffer = '';
        } else if (line.startsWith('data: ')) {
            dataBuffer += (dataBuffer ? '\n' : '') + line.slice(6);
        } else if (line === '' && currentEvent && dataBuffer) {
            try {
                events.push({ type: currentEvent, data: JSON.parse(dataBuffer), raw: dataBuffer });
            } catch {
                events.push({ type: currentEvent, data: null, raw: dataBuffer, parseError: true });
            }
            currentEvent = null;
            dataBuffer = '';
        }
    }

    // Flush remaining
    if (currentEvent && dataBuffer) {
        try {
            events.push({ type: currentEvent, data: JSON.parse(dataBuffer), raw: dataBuffer });
        } catch {
            events.push({ type: currentEvent, data: null, raw: dataBuffer, parseError: true });
        }
    }

    return events;
}

// ─── Assertion Helpers ───────────────────────────────────────────────────────

class AssertionCollector {
    constructor() {
        this.results = [];
    }

    assert(name, condition, details = '') {
        this.results.push({
            name,
            passed: !!condition,
            details: condition ? '' : details,
        });
        return !!condition;
    }

    assertEquals(name, actual, expected, details = '') {
        const passed = actual === expected;
        this.results.push({
            name,
            passed,
            details: passed ? '' : (details || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
        });
        return passed;
    }

    assertGreaterThan(name, actual, threshold, details = '') {
        const passed = actual > threshold;
        this.results.push({
            name,
            passed,
            details: passed ? '' : (details || `Expected > ${threshold}, got ${actual}`),
        });
        return passed;
    }

    assertLessThan(name, actual, threshold, details = '') {
        const passed = actual < threshold;
        this.results.push({
            name,
            passed,
            details: passed ? '' : (details || `Expected < ${threshold}, got ${actual}`),
        });
        return passed;
    }

    assertIncludes(name, arr, item, details = '') {
        const passed = Array.isArray(arr) && arr.includes(item);
        this.results.push({
            name,
            passed,
            details: passed ? '' : (details || `Array does not include ${JSON.stringify(item)}`),
        });
        return passed;
    }

    get passed() { return this.results.filter(r => r.passed).length; }
    get failed() { return this.results.filter(r => !r.passed).length; }
    get total() { return this.results.length; }

    summary() {
        const lines = [];
        lines.push(`\n${'═'.repeat(70)}`);
        lines.push(`ASSERTION RESULTS: ${this.passed}/${this.total} passed`);
        lines.push('═'.repeat(70));
        for (const r of this.results) {
            const icon = r.passed ? '✅' : '❌';
            lines.push(`  ${icon} ${r.name}`);
            if (r.details) lines.push(`     └─ ${r.details}`);
        }
        lines.push('═'.repeat(70));
        return lines.join('\n');
    }
}

// ─── LiveTestRunner ──────────────────────────────────────────────────────────

export class LiveTestRunner {
    constructor(options = {}) {
        this.port = options.port || 0; // 0 = random available port
        this.agentVersion = options.agentVersion || process.env.AGENT_VERSION || 'v2';
        this.server = null;
        this.app = null;
        this.baseUrl = null;
        this.timeout = options.timeout || 300_000; // 5 min default
        this._lastState = null;
    }

    // ── Setup / Teardown ──

    async setup() {
        // Set agent version (can be overridden by constructor options)
        process.env.AGENT_VERSION = this.agentVersion;
        process.env.NODE_ENV = 'test';

        // Dynamically import the app (must happen after env is set)
        // The server auto-starts in index.js unless BUILD_CHECK is set,
        // but we need control over the port. We'll import the app export
        // and create our own server.
        process.env.BUILD_CHECK = '1'; // Prevent auto-listen

        // Clear module cache for fresh import
        const appModule = await import('../../src/index.js');
        this.app = appModule.app;

        // Create our own server on a random port
        this.server = http.createServer(this.app);
        this.server.listen(0);
        await once(this.server, 'listening');
        const addr = this.server.address();
        this.port = addr.port;
        this.baseUrl = `http://127.0.0.1:${this.port}`;

        // Initialize the LLM model
        const { initializeModel } = await import('../../src/services/llm.js');
        await initializeModel();

        console.log(`\n🔥 Live test server running on port ${this.port}`);
        console.log(`   Agent version: ${process.env.AGENT_VERSION}`);
        console.log(`   Base URL: ${this.baseUrl}\n`);

        // Health check
        const health = await this._fetch('/health');
        if (health.status !== 'healthy') {
            throw new Error(`Server not healthy: ${JSON.stringify(health)}`);
        }

        return this;
    }

    async teardown() {
        if (this.server) {
            this.server.closeAllConnections?.();
            this.server.close();
            this.server = null;
        }
        console.log('🛑 Live test server stopped');
    }

    // ── Core API Methods ──

    async analyze(prompt, options = {}) {
        return this._fetch('/api/analyze', {
            method: 'POST',
            body: {
                prompt,
                framework: options.framework || 'auto',
                styling: options.styling || 'auto',
            },
        });
    }

    async plan(requirements) {
        return this._fetch('/api/plan', {
            method: 'POST',
            body: { requirements },
        });
    }

    async generate(prompt, options = {}) {
        const startTime = Date.now();
        const timeout = options.timeout || this.timeout;

        try {
            // Step 1: Analyze
            console.log('  📝 Analyzing prompt...');
            const analysis = await this.analyze(prompt, {
                framework: options.framework,
                styling: options.styling,
            });

            if (analysis._error) {
                return this._errorResult('Analysis failed', analysis, startTime);
            }

            // Build requirements from analysis
            const requirements = {
                framework: options.framework || analysis.framework || 'react',
                stylingFramework: options.styling || analysis.stylingFramework || 'tailwind',
                complexity: options.complexity || analysis.complexity || 'simple',
                projectType: analysis.projectType || 'web-app',
                features: analysis.features || [],
                description: analysis.description || prompt,
            };

            // Step 2: Plan
            console.log('  📐 Generating plan...');
            const planResult = await this.plan(requirements);

            if (planResult._error) {
                return this._errorResult('Planning failed', planResult, startTime);
            }

            // Step 3: Generate (SSE)
            console.log('  🏗️  Generating project (SSE stream)...');
            const generateResult = await this._fetchSSE('/api/generate', {
                body: {
                    prompt,
                    requirements,
                    plan: planResult,
                },
                timeout,
            });

            const duration = Date.now() - startTime;
            const files = {};
            const fileStatuses = {};

            // Extract files from events
            for (const evt of generateResult.events) {
                if (evt.type === 'file_generated' && evt.data?.path) {
                    files[evt.data.path] = evt.data.content || '';
                    fileStatuses[evt.data.path] = {
                        status: 'generated',
                        validation: evt.data.validation || {},
                    };
                }
                if (evt.type === 'file_fixed' && evt.data?.path) {
                    files[evt.data.path] = evt.data.content || '';
                    fileStatuses[evt.data.path] = {
                        status: 'fixed',
                        validation: evt.data.validation || {},
                    };
                }
            }

            const metrics = this._extractMetrics(generateResult.events, duration);
            this._lastState = { events: generateResult.events, files, metrics, requirements, plan: planResult };

            return {
                events: generateResult.events,
                files,
                fileStatuses,
                metrics,
                duration,
                requirements,
                plan: planResult,
                analysis,
                rawSSE: generateResult.raw,
            };
        } catch (err) {
            const duration = Date.now() - startTime;
            console.error(`  ❌ Generation error: ${err.message}`);
            return {
                events: [],
                files: {},
                fileStatuses: {},
                metrics: { error: err.message },
                duration,
                error: err.message,
                lastState: this._lastState,
            };
        }
    }

    async edit(currentFiles, editPayload) {
        const startTime = Date.now();

        try {
            console.log(`  ✏️  Running ${editPayload.editType} edit...`);
            const result = await this._fetchSSE('/api/edit', {
                body: {
                    editType: editPayload.editType,
                    payload: editPayload.payload,
                    currentFiles,
                    framework: editPayload.framework || 'react',
                },
                timeout: editPayload.timeout || 120_000,
            });

            const duration = Date.now() - startTime;
            const updatedFiles = { ...currentFiles };

            // Apply updates from events
            for (const evt of result.events) {
                if (evt.type === 'edit_file_updated' && evt.data?.path && evt.data?.content) {
                    updatedFiles[evt.data.path] = evt.data.content;
                }
                if (evt.type === 'edit_complete' && evt.data?.updatedFiles) {
                    for (const f of evt.data.updatedFiles) {
                        if (f.path && f.content) {
                            updatedFiles[f.path] = f.content;
                        }
                    }
                }
            }

            return {
                events: result.events,
                updatedFiles,
                metrics: { duration },
                duration,
            };
        } catch (err) {
            return {
                events: [],
                updatedFiles: currentFiles,
                metrics: { error: err.message },
                duration: Date.now() - startTime,
                error: err.message,
            };
        }
    }

    async bundle(files) {
        try {
            const result = await this._fetch('/api/bundle', {
                method: 'POST',
                body: { files },
            });

            return {
                html: result.html || '',
                errors: result.errors || [],
                warnings: result.warnings || [],
                success: !result._error && (!result.errors || result.errors.length === 0),
            };
        } catch (err) {
            return {
                html: '',
                errors: [err.message],
                warnings: [],
                success: false,
            };
        }
    }

    // ── Utility Methods ──

    createAssertions() {
        return new AssertionCollector();
    }

    extractContracts(content, filePath) {
        return extractContracts(content, filePath);
    }

    printSummary(result) {
        const lines = [];
        lines.push('\n' + '═'.repeat(70));
        lines.push('GENERATION SUMMARY');
        lines.push('═'.repeat(70));
        lines.push(`  Duration:     ${(result.duration / 1000).toFixed(1)}s`);
        lines.push(`  Total Events: ${result.events.length}`);
        lines.push(`  Files:        ${Object.keys(result.files).length}`);

        if (result.error) {
            lines.push(`  ERROR:        ${result.error}`);
        }

        // File statuses
        if (Object.keys(result.fileStatuses || {}).length > 0) {
            lines.push('\n  FILES:');
            for (const [path, info] of Object.entries(result.fileStatuses)) {
                const icon = info.status === 'generated' ? '✅' : info.status === 'fixed' ? '🔧' : '❌';
                const size = (result.files[path] || '').length;
                lines.push(`    ${icon} ${path} (${info.status}, ${size} chars)`);
            }
        }

        // Event timeline
        lines.push('\n  EVENT TIMELINE:');
        const eventCounts = {};
        for (const evt of result.events) {
            eventCounts[evt.type] = (eventCounts[evt.type] || 0) + 1;
        }
        for (const [type, count] of Object.entries(eventCounts)) {
            lines.push(`    ${type}: ${count}`);
        }

        // Errors
        const errors = result.events.filter(e => e.type === 'file_error' || e.type === 'generation_error');
        if (errors.length > 0) {
            lines.push('\n  ERRORS:');
            for (const err of errors) {
                lines.push(`    ❌ ${err.type}: ${JSON.stringify(err.data).substring(0, 120)}`);
            }
        }

        // Metrics
        if (result.metrics && !result.metrics.error) {
            lines.push('\n  METRICS:');
            for (const [key, value] of Object.entries(result.metrics)) {
                if (key !== 'eventTimeline') {
                    lines.push(`    ${key}: ${JSON.stringify(value)}`);
                }
            }
        }

        lines.push('═'.repeat(70));
        console.log(lines.join('\n'));
    }

    // ── Internal Helpers ──

    async _fetch(path, options = {}) {
        const url = `${this.baseUrl}${path}`;
        const method = options.method || 'GET';
        const body = options.body ? JSON.stringify(options.body) : null;

        const headers = { 'Content-Type': 'application/json' };
        if (options.sessionId) headers['X-Session-Id'] = options.sessionId;

        try {
            const response = await fetch(url, { method, headers, body });
            const data = await response.json();
            if (!response.ok) data._error = true;
            return data;
        } catch (err) {
            return { _error: true, error: err.message };
        }
    }

    async _fetchSSE(path, options = {}) {
        const url = `${this.baseUrl}${path}`;
        const timeout = options.timeout || this.timeout;

        return new Promise((resolve, reject) => {
            const body = JSON.stringify(options.body || {});
            const urlObj = new URL(url);

            const reqOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    'Accept': 'text/event-stream',
                },
            };

            let rawData = '';
            let timedOut = false;

            const timer = setTimeout(() => {
                timedOut = true;
                req.destroy();
                const events = parseSSEStream(rawData);
                resolve({ events, raw: rawData, timedOut: true });
            }, timeout);

            const req = http.request(reqOptions, (res) => {
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    rawData += chunk;
                });
                res.on('end', () => {
                    if (timedOut) return;
                    clearTimeout(timer);
                    const events = parseSSEStream(rawData);
                    resolve({ events, raw: rawData, timedOut: false });
                });
            });

            req.on('error', (err) => {
                if (timedOut) return;
                clearTimeout(timer);
                const events = parseSSEStream(rawData);
                resolve({ events, raw: rawData, error: err.message });
            });

            req.write(body);
            req.end();
        });
    }

    _extractMetrics(events, duration) {
        const metrics = {
            duration,
            durationSec: (duration / 1000).toFixed(1),
            totalEvents: events.length,
            filesGenerated: 0,
            filesFixed: 0,
            filesFailed: 0,
            filesTotal: 0,
            planRevisions: 0,
            hasCompletion: false,
            hasError: false,
            quality: null,
            eventTimeline: [],
        };

        for (const evt of events) {
            metrics.eventTimeline.push(evt.type);
            switch (evt.type) {
                case 'file_generated':
                    metrics.filesGenerated++;
                    metrics.filesTotal++;
                    break;
                case 'file_fixed':
                    metrics.filesFixed++;
                    break;
                case 'file_error':
                    metrics.filesFailed++;
                    break;
                case 'generation_complete':
                    metrics.hasCompletion = true;
                    metrics.quality = evt.data?.metrics?.quality;
                    break;
                case 'generation_error':
                    metrics.hasError = true;
                    break;
            }
        }

        return metrics;
    }

    _errorResult(message, data, startTime) {
        return {
            events: [],
            files: {},
            fileStatuses: {},
            metrics: { error: message, details: data },
            duration: Date.now() - startTime,
            error: message,
        };
    }
}

export { AssertionCollector, parseSSEStream };
