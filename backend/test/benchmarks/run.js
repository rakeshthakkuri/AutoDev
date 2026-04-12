#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// Benchmark Runner CLI
//
// Usage:
//   node test/benchmarks/run.js --version v2 --filter all --output results.json
//   node test/benchmarks/run.js --version v1 --filter S
//   node test/benchmarks/run.js --version v2 --filter M --delay 10000
// ═══════════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import { BenchmarkRunner } from './framework.js';
import benchmarks from './prompts.js';

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
    const idx = args.indexOf('--' + name);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
};

const version = getArg('version', 'v2');
const filter = getArg('filter', 'all');
const output = getArg('output', `results-${version}-${Date.now()}.json`);
const delay = parseInt(getArg('delay', '5000'), 10);

// Filter benchmarks
let selected = benchmarks;
if (filter !== 'all') {
    const prefix = filter.toUpperCase();
    selected = benchmarks.filter(b => b.id.startsWith(prefix));
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`BENCHMARK SUITE`);
console.log(`${'═'.repeat(60)}`);
console.log(`  Version:    ${version}`);
console.log(`  Filter:     ${filter} (${selected.length} benchmarks)`);
console.log(`  Output:     ${output}`);
console.log(`  Delay:      ${delay}ms between benchmarks`);
console.log(`${'═'.repeat(60)}\n`);

const runner = new BenchmarkRunner({ agentVersion: version });

try {
    await runner.setup();
    const report = await runner.runAll(selected, { delayMs: delay });
    console.log(report);

    // Save JSON results
    const jsonOutput = JSON.stringify(runner.toJSON(), null, 2);
    fs.writeFileSync(output, jsonOutput);
    console.log(`\nResults saved to ${output}`);
} catch (err) {
    console.error('Benchmark suite failed:', err.message);
    process.exit(1);
} finally {
    await runner.teardown();
}
