// ═══════════════════════════════════════════════════════════════════════════════
// Benchmark Framework — Scores generation quality across multiple dimensions
// ═══════════════════════════════════════════════════════════════════════════════

import { LiveTestRunner } from '../v2-live/smoke-runner.js';
import { extractContracts } from '../../src/agents/shared/contracts.js';

export class BenchmarkRunner {
    constructor(options = {}) {
        this.agentVersion = options.agentVersion || 'v2';
        this.results = [];
        this.runner = null;
    }

    async setup() {
        process.env.AGENT_VERSION = this.agentVersion;
        this.runner = new LiveTestRunner({ timeout: 360_000, agentVersion: this.agentVersion });
        await this.runner.setup();
    }

    async teardown() {
        if (this.runner) await this.runner.teardown();
    }

    async runBenchmark(benchmark) {
        const startTime = Date.now();
        console.log(`\n  [${benchmark.id}] Generating: "${benchmark.prompt.substring(0, 60)}..."`);

        const result = await this.runner.generate(benchmark.prompt, {
            framework: benchmark.framework,
            styling: benchmark.styling,
            complexity: benchmark.complexity,
            timeout: benchmark.timeoutMs || 300_000,
        });

        const duration = Date.now() - startTime;
        const score = await this.score(result, benchmark, duration);

        const entry = {
            id: benchmark.id,
            prompt: benchmark.prompt,
            framework: benchmark.framework,
            styling: benchmark.styling,
            complexity: benchmark.complexity,
            duration,
            score,
            fileCount: Object.keys(result.files).length,
            plannedCount: (result.plan?.files || []).length,
        };

        this.results.push(entry);
        console.log(`  [${benchmark.id}] Score: ${score.composite}/100 | ${Object.keys(result.files).length} files | ${(duration / 1000).toFixed(0)}s`);
        return entry;
    }

    async score(result, benchmark, duration) {
        const scores = {};

        // 1. Completion (0 or 1)
        scores.completion = result.events.some(e => e.type === 'generation_complete') ? 1 : 0;

        // 2. File success rate
        scores.fileSuccess = this.calcFileSuccessRate(result);

        // 3. Clean generation rate (no fixes needed)
        scores.cleanRate = this.calcCleanRate(result);

        // 4. Import consistency
        scores.importConsistency = this.calcImportConsistency(result);

        // 5. Contract validity
        scores.contractValidity = this.calcContractValidity(result);

        // 6. Bundle success
        try {
            if (Object.keys(result.files).length > 0) {
                const bundle = await this.runner.bundle(result.files);
                scores.bundleSuccess = (bundle.errors || []).length === 0 ? 1 : 0;
            } else {
                scores.bundleSuccess = 0;
            }
        } catch {
            scores.bundleSuccess = 0;
        }

        // 7. Required files present
        scores.requiredFiles = this.calcRequiredFiles(result, benchmark.mustContainFiles);

        // 8. No forbidden patterns
        scores.noForbiddenPatterns = this.calcForbiddenPatterns(result, benchmark.forbiddenPatterns);

        // 9. Time score
        scores.timeScore = duration < (benchmark.maxDurationMs || 300_000) ? 1 : 0;

        // Weighted composite (0-100)
        scores.composite = Math.round(
            scores.completion * 20 +
            scores.fileSuccess * 20 +
            scores.cleanRate * 10 +
            scores.importConsistency * 15 +
            scores.contractValidity * 10 +
            scores.bundleSuccess * 15 +
            scores.requiredFiles * 5 +
            scores.noForbiddenPatterns * 5
        );

        return scores;
    }

    calcFileSuccessRate(result) {
        const statuses = Object.values(result.fileStatuses || {});
        if (statuses.length === 0) return 0;
        const ok = statuses.filter(s => s.status === 'generated' || s.status === 'fixed');
        return ok.length / statuses.length;
    }

    calcCleanRate(result) {
        const statuses = Object.values(result.fileStatuses || {});
        if (statuses.length === 0) return 0;
        const clean = statuses.filter(s => s.status === 'generated');
        return clean.length / statuses.length;
    }

    calcImportConsistency(result) {
        const files = result.files || {};
        const paths = Object.keys(files);
        if (paths.length === 0) return 0;

        let totalImports = 0;
        let resolvedImports = 0;

        for (const [filePath, content] of Object.entries(files)) {
            if (!filePath.match(/\.(jsx?|tsx?)$/)) continue;
            const importRe = /import\s+.*?from\s+['"](\.\/[^'"]+|\.\.\/[^'"]+)['"]/g;
            let match;
            while ((match = importRe.exec(content)) !== null) {
                totalImports++;
                const importPath = match[1];
                const dir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
                const resolved = resolvePath(dir, importPath);
                const found = paths.some(p =>
                    p === resolved || p.startsWith(resolved + '.') || p.startsWith(resolved + '/index.')
                );
                if (found) resolvedImports++;
            }
        }

        return totalImports === 0 ? 1 : resolvedImports / totalImports;
    }

    calcContractValidity(result) {
        const files = result.files || {};
        const jsFiles = Object.entries(files).filter(([p]) =>
            p.match(/\.(jsx?|tsx?)$/) && !p.includes('main.') && !p.includes('config')
        );
        if (jsFiles.length === 0) return 0;

        let valid = 0;
        for (const [path, content] of jsFiles) {
            const contracts = extractContracts(content, path);
            if (contracts.defaultExport || contracts.exports.length > 0) valid++;
        }
        return valid / jsFiles.length;
    }

    calcRequiredFiles(result, required) {
        if (!required || required.length === 0) return 1;
        const paths = Object.keys(result.files || {});
        let found = 0;
        for (const req of required) {
            if (paths.some(p => p === req || p.endsWith('/' + req))) found++;
        }
        return found / required.length;
    }

    calcForbiddenPatterns(result, patterns) {
        if (!patterns || patterns.length === 0) return 1;
        const files = Object.entries(result.files || {});
        if (files.length === 0) return 1;

        let clean = 0;
        for (const [, content] of files) {
            const hasForbidden = patterns.some(p => content.includes(p));
            if (!hasForbidden) clean++;
        }
        return clean / files.length;
    }

    async runAll(benchmarks, options = {}) {
        const delayMs = options.delayMs || 5000;
        for (let i = 0; i < benchmarks.length; i++) {
            if (i > 0 && delayMs > 0) {
                await new Promise(r => setTimeout(r, delayMs));
            }
            await this.runBenchmark(benchmarks[i]);
        }
        return this.generateReport();
    }

    generateReport() {
        const lines = [];
        lines.push('\n' + '═'.repeat(95));
        lines.push('BENCHMARK RESULTS');
        lines.push('═'.repeat(95));
        lines.push(`${'ID'.padEnd(5)} ${'Prompt'.padEnd(45)} ${'Score'.padStart(5)} ${'Time'.padStart(6)} ${'Files'.padStart(7)} ${'Clean%'.padStart(7)} ${'Bundle'.padStart(7)}`);
        lines.push('─'.repeat(95));

        for (const r of this.results) {
            const prompt = r.prompt.substring(0, 43).padEnd(45);
            const score = String(r.score.composite).padStart(5);
            const time = `${(r.duration / 1000).toFixed(0)}s`.padStart(6);
            const files = `${r.fileCount}/${r.plannedCount}`.padStart(7);
            const clean = `${Math.round(r.score.cleanRate * 100)}%`.padStart(7);
            const bundle = (r.score.bundleSuccess ? ' pass' : ' FAIL').padStart(7);
            lines.push(`${r.id.padEnd(5)} ${prompt} ${score} ${time} ${files} ${clean} ${bundle}`);
        }

        lines.push('─'.repeat(95));

        // Aggregates
        const avg = (arr, fn) => arr.length > 0 ? arr.reduce((s, r) => s + fn(r), 0) / arr.length : 0;
        const allScores = avg(this.results, r => r.score.composite);
        const allTime = avg(this.results, r => r.duration / 1000);
        const allFileRate = avg(this.results, r => r.score.fileSuccess);
        const allClean = avg(this.results, r => r.score.cleanRate);
        const allBundle = avg(this.results, r => r.score.bundleSuccess);

        lines.push(`${''.padEnd(5)} ${'AGGREGATE'.padEnd(45)} ${String(Math.round(allScores)).padStart(5)} ${allTime.toFixed(0).padStart(5)}s ${Math.round(allFileRate * 100).toString().padStart(5)}%  ${Math.round(allClean * 100).toString().padStart(5)}%  ${Math.round(allBundle * 100).toString().padStart(5)}%`);

        // By tier
        lines.push('');
        for (const [tier, prefix] of [['Simple', 'S'], ['Intermediate', 'M'], ['Advanced', 'A']]) {
            const tierResults = this.results.filter(r => r.id.startsWith(prefix));
            if (tierResults.length > 0) {
                const tierAvg = avg(tierResults, r => r.score.composite);
                lines.push(`  ${tier} avg: ${Math.round(tierAvg)}/100`);
            }
        }

        lines.push('═'.repeat(95));
        return lines.join('\n');
    }

    toJSON() {
        return {
            agentVersion: this.agentVersion,
            timestamp: new Date().toISOString(),
            results: this.results,
        };
    }
}

function resolvePath(fromDir, importPath) {
    const parts = (fromDir ? fromDir + '/' + importPath : importPath).split('/');
    const resolved = [];
    for (const part of parts) {
        if (part === '.' || part === '') continue;
        if (part === '..') resolved.pop();
        else resolved.push(part);
    }
    return resolved.join('/');
}
