#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// Benchmark Comparison — Compare two result JSON files
//
// Usage: node test/benchmarks/compare.js results-v1.json results-v2.json
// ═══════════════════════════════════════════════════════════════════════════════

import fs from 'fs';

const [file1, file2] = process.argv.slice(2);
if (!file1 || !file2) {
    console.error('Usage: node compare.js <results-a.json> <results-b.json>');
    process.exit(1);
}

const a = JSON.parse(fs.readFileSync(file1, 'utf8'));
const b = JSON.parse(fs.readFileSync(file2, 'utf8'));

const labelA = `${a.agentVersion || 'A'} (${file1.split('/').pop()})`;
const labelB = `${b.agentVersion || 'B'} (${file2.split('/').pop()})`;

// Build lookup maps
const mapA = Object.fromEntries(a.results.map(r => [r.id, r]));
const mapB = Object.fromEntries(b.results.map(r => [r.id, r]));
const allIds = [...new Set([...a.results.map(r => r.id), ...b.results.map(r => r.id)])].sort();

const avg = (arr, fn) => arr.length > 0 ? arr.reduce((s, r) => s + fn(r), 0) / arr.length : 0;

console.log('\n' + '═'.repeat(80));
console.log('BENCHMARK COMPARISON');
console.log('═'.repeat(80));
console.log(`  A: ${labelA}`);
console.log(`  B: ${labelB}`);
console.log('');

// Per-benchmark comparison
console.log(`${'ID'.padEnd(5)} ${'Score A'.padStart(8)} ${'Score B'.padStart(8)} ${'Delta'.padStart(7)} ${'Winner'.padStart(8)}`);
console.log('─'.repeat(40));

let bWins = 0, aWins = 0, ties = 0;

for (const id of allIds) {
    const ra = mapA[id];
    const rb = mapB[id];
    const sa = ra?.score?.composite ?? '-';
    const sb = rb?.score?.composite ?? '-';
    const delta = (typeof sa === 'number' && typeof sb === 'number') ? sb - sa : '-';
    const winner = delta > 0 ? 'B' : delta < 0 ? 'A' : 'TIE';
    if (winner === 'B') bWins++;
    else if (winner === 'A') aWins++;
    else ties++;

    console.log(`${id.padEnd(5)} ${String(sa).padStart(8)} ${String(sb).padStart(8)} ${(typeof delta === 'number' ? (delta > 0 ? '+' : '') + delta : delta).toString().padStart(7)} ${winner.padStart(8)}`);
}

console.log('─'.repeat(40));

// Aggregate comparison
const aAll = a.results.filter(r => r.score);
const bAll = b.results.filter(r => r.score);

const metrics = [
    ['Composite Score', r => r.score.composite],
    ['Completion Rate', r => r.score.completion * 100],
    ['Clean Rate', r => r.score.cleanRate * 100],
    ['Import Consistency', r => r.score.importConsistency * 100],
    ['Bundle Success', r => r.score.bundleSuccess * 100],
    ['Avg Duration (s)', r => r.duration / 1000],
];

console.log(`\n${'Metric'.padEnd(25)} ${labelA.substring(0, 12).padStart(12)} ${labelB.substring(0, 12).padStart(12)} ${'Delta'.padStart(8)}`);
console.log('─'.repeat(60));

for (const [name, fn] of metrics) {
    const va = Math.round(avg(aAll, fn) * 10) / 10;
    const vb = Math.round(avg(bAll, fn) * 10) / 10;
    const delta = Math.round((vb - va) * 10) / 10;
    const sign = delta > 0 ? '+' : '';
    console.log(`${name.padEnd(25)} ${String(va).padStart(12)} ${String(vb).padStart(12)} ${(sign + delta).padStart(8)}`);
}

// By tier
console.log('');
for (const [tier, prefix] of [['Simple', 'S'], ['Intermediate', 'M'], ['Advanced', 'A']]) {
    const tierA = aAll.filter(r => r.id.startsWith(prefix));
    const tierB = bAll.filter(r => r.id.startsWith(prefix));
    if (tierA.length > 0 || tierB.length > 0) {
        const va = Math.round(avg(tierA, r => r.score.composite));
        const vb = Math.round(avg(tierB, r => r.score.composite));
        console.log(`  ${tier}: A=${va} B=${vb} (${vb - va > 0 ? '+' : ''}${vb - va})`);
    }
}

console.log('');
console.log(`  B wins: ${bWins}/${allIds.length}`);
console.log(`  A wins: ${aWins}/${allIds.length}`);
console.log(`  Ties:   ${ties}/${allIds.length}`);

// Flag regressions
const regressions = allIds.filter(id => {
    const sa = mapA[id]?.score?.composite;
    const sb = mapB[id]?.score?.composite;
    return typeof sa === 'number' && typeof sb === 'number' && sb < sa;
});

if (regressions.length > 0) {
    console.log(`\n  ⚠️  REGRESSIONS (B scored lower): ${regressions.join(', ')}`);
}

console.log('═'.repeat(80));
