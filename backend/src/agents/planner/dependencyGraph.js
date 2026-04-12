/**
 * dependencyGraph.js
 *
 * Directed acyclic graph of file dependencies from a plan.
 * Node = file path. For each file F, graph[F] = files that must be generated BEFORE F.
 */

// ─── Layer classification ──────────────────────────────────────────────────────

const LAYER_ORDER = [
    { pattern: /\/(types|constants|config)\//i, layer: 0 },
    { pattern: /\/(utils|helpers|lib)\//i, layer: 1 },
    { pattern: /\/(services|api|clients)\//i, layer: 2 },
    { pattern: /\/(hooks|store|context|state)\//i, layer: 3 },
    { pattern: /\/(components\/ui|ui\/components)\//i, layer: 4 },
    { pattern: /\/components\//i, layer: 5 },
    { pattern: /\/(pages|views|screens|layouts)\//i, layer: 6 },
    { pattern: /\/(App|main|index)\.(jsx?|tsx?)$/i, layer: 7 },
    { pattern: /index\.(html|css)$/i, layer: 7 },
];

const CONFIG_FILES = /\.(config|rc)\.(js|ts|json|cjs|mjs)$|^(package|tsconfig|vite\.config|tailwind\.config)/i;

export function classifyLayer(filePath) {
    if (CONFIG_FILES.test(filePath)) return -1;
    for (const { pattern, layer } of LAYER_ORDER) {
        if (pattern.test(filePath)) return layer;
    }
    return 4;
}

function normalizePath(f) {
    return typeof f === 'string' ? f : f?.path;
}

// ─── Graph construction ────────────────────────────────────────────────────────

/**
 * @param {(string|{path:string})[]} files
 * @param {Record<string, string[]>} [explicitImports]
 * @returns {Record<string, string[]>}
 */
export function buildDependencyGraph(files, explicitImports = {}) {
    const pathList = files.map(normalizePath).filter(Boolean);
    const graph = Object.fromEntries(pathList.map(f => [f, []]));
    const fileSet = new Set(pathList);

    for (const file of pathList) {
        if (explicitImports[file]?.length) {
            for (const dep of explicitImports[file]) {
                if (fileSet.has(dep) && dep !== file) {
                    graph[file].push(dep);
                }
            }
            continue;
        }

        const fileLayer = classifyLayer(file);
        for (const other of pathList) {
            if (other === file) continue;
            const otherLayer = classifyLayer(other);
            if (otherLayer < fileLayer) {
                const fileDir = file.split('/').slice(0, -1).join('/');
                const otherDir = other.split('/').slice(0, -1).join('/');
                const isShared = otherLayer <= 3;
                const isSameModule = fileDir && otherDir && fileDir === otherDir;
                if (isShared || isSameModule) {
                    graph[file].push(other);
                }
            }
        }
    }

    return graph;
}

// ─── Topological sort (Kahn) ─────────────────────────────────────────────────

/**
 * @param {string[]} files
 * @param {Record<string, string[]>} graph
 * @returns {string[]}
 */
export function topologicalSort(files, graph) {
    const inDegree = new Map();
    for (const f of files) {
        inDegree.set(f, (graph[f] || []).length);
    }

    const queue = files.filter(f => inDegree.get(f) === 0).sort((a, b) => {
        const la = classifyLayer(a);
        const lb = classifyLayer(b);
        if (la !== lb) return la - lb;
        return a.localeCompare(b);
    });

    const result = [];

    while (queue.length > 0) {
        queue.sort((a, b) => {
            const la = classifyLayer(a);
            const lb = classifyLayer(b);
            if (la !== lb) return la - lb;
            return a.localeCompare(b);
        });

        const file = queue.shift();
        result.push(file);

        for (const f of files) {
            const deps = graph[f] || [];
            if (deps.includes(file)) {
                inDegree.set(f, inDegree.get(f) - 1);
                if (inDegree.get(f) === 0) {
                    queue.push(f);
                }
            }
        }
    }

    if (result.length !== files.length) {
        const missing = files.filter(f => !result.includes(f));
        throw new Error(`Circular dependency detected in plan. Affected files: ${missing.join(', ')}`);
    }

    return result;
}

// ─── Cycle detection ───────────────────────────────────────────────────────────

export function detectCycles(files, graph) {
    const visited = new Set();
    const inStack = new Set();
    const cycles = [];

    function dfs(file, stackPath) {
        if (inStack.has(file)) {
            const cycleStart = stackPath.indexOf(file);
            if (cycleStart >= 0) cycles.push(stackPath.slice(cycleStart).concat(file));
            return;
        }
        if (visited.has(file)) return;

        inStack.add(file);
        for (const dep of graph[file] || []) {
            dfs(dep, [...stackPath, file]);
        }
        inStack.delete(file);
        visited.add(file);
    }

    for (const file of files) {
        if (!visited.has(file)) dfs(file, []);
    }

    return cycles;
}

/**
 * @param {object} plan - { files: [...], imports?: {} }
 * @returns {string[]}
 */
export function sortFilesByDependency(plan) {
    const raw = plan?.files || [];
    if (raw.length === 0) return [];

    const pathList = raw.map(normalizePath).filter(Boolean);
    const explicitImports = plan.imports || {};
    const graph = buildDependencyGraph(raw, explicitImports);

    const cycles = detectCycles(pathList, graph);
    if (cycles.length > 0) {
        console.warn('Dependency cycles detected, falling back to layer order:', cycles);
        return [...pathList].sort((a, b) => {
            const la = classifyLayer(a);
            const lb = classifyLayer(b);
            if (la !== lb) return la - lb;
            return a.localeCompare(b);
        });
    }

    try {
        return topologicalSort(pathList, graph);
    } catch (err) {
        console.warn(err.message);
        return [...pathList].sort((a, b) => {
            const la = classifyLayer(a);
            const lb = classifyLayer(b);
            if (la !== lb) return la - lb;
            return a.localeCompare(b);
        });
    }
}

/**
 * Reorder plan.files to match sorted paths (preserves { path, purpose } objects).
 * @param {object} plan
 * @param {string[]} sortedPaths
 */
export function reorderPlanFiles(plan, sortedPaths) {
    const byPath = new Map();
    for (const f of plan.files) {
        const p = normalizePath(f);
        byPath.set(p, f);
    }
    plan.files = sortedPaths.map(p => byPath.get(p)).filter(Boolean);
}
