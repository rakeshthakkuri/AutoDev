/**
 * importResolver.js — static import/export analysis across a project (no LLM).
 */

import path from 'path';

/**
 * @param {string} code
 * @param {string} filePath
 */
export function parseImports(code, filePath) {
    const imports = [];
    const norm = filePath.replace(/\\/g, '/');
    const fileDir = path.posix.dirname(norm);

    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

    const src = stripComments(code || '');
    const importFromRe = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = importFromRe.exec(src)) !== null) {
        const binding = m[1].trim();
        const specifier = m[2];
        if (!specifier.startsWith('.')) continue;

        const resolvedPath = path.posix.normalize(path.posix.join(fileDir, specifier)).replace(/\\/g, '/');

        if (binding.startsWith('*')) {
            imports.push({
                specifier,
                resolvedPath,
                defaultImport: null,
                namedImports: [],
                isNamespace: true,
                raw: m[0],
            });
            continue;
        }

        let defaultImport = null;
        let namedImports = [];

        if (binding.startsWith('{')) {
            const end = binding.indexOf('}');
            const inner = end > 0 ? binding.slice(1, end) : binding.slice(1);
            namedImports = inner
                .split(',')
                .map(s => s.trim().split(/\s+as\s+/)[0].trim())
                .filter(Boolean);
        } else {
            const comma = binding.indexOf(',');
            if (comma === -1) {
                defaultImport = binding.split(/\s+as\s+/)[0].trim() || null;
            } else {
                const first = binding.slice(0, comma).trim();
                defaultImport = first.split(/\s+as\s+/)[0].trim() || null;
                const rest = binding.slice(comma + 1).trim();
                if (rest.startsWith('{')) {
                    const end = rest.indexOf('}');
                    const inner = end > 0 ? rest.slice(1, end) : rest.slice(1);
                    namedImports = inner
                        .split(',')
                        .map(s => s.trim().split(/\s+as\s+/)[0].trim())
                        .filter(Boolean);
                }
            }
        }

        imports.push({
            specifier,
            resolvedPath,
            defaultImport,
            namedImports,
            isNamespace: false,
            raw: m[0],
        });
    }

    return imports;
}

export function parseExports(code) {
    const named = new Set();
    let hasDefault = false;

    if (/export\s+default\s+/m.test(code || '')) hasDefault = true;

    const re1 = /export\s+(?:async\s+)?(?:function|class|const|let|var|enum|abstract\s+class)\s+(\w+)/g;
    let m;
    while ((m = re1.exec(code)) !== null) named.add(m[1]);

    const re2 = /export\s+(?:type\s+)?\{([^}]+)\}/g;
    while ((m = re2.exec(code)) !== null) {
        m[1].split(',').forEach(part => {
            const name = part.replace(/\s+as\s+\w+/, '').trim();
            if (name && !name.includes(' ')) named.add(name);
        });
    }

    const re3 = /export\s+type\s+(\w+)\s*[={]/g;
    while ((m = re3.exec(code)) !== null) named.add(m[1]);

    const re4 = /export\s+interface\s+(\w+)/g;
    while ((m = re4.exec(code)) !== null) named.add(m[1]);

    return { named: [...named], hasDefault };
}

function resolveFileInProject(resolvedPath, projectFiles) {
    const keys = Object.keys(projectFiles);
    if (projectFiles[resolvedPath]) return resolvedPath;

    const extensions = ['.jsx', '.js', '.tsx', '.ts', '.json', '.vue', '.svelte'];
    for (const ext of extensions) {
        const withExt = resolvedPath + ext;
        if (projectFiles[withExt]) return withExt;
    }

    for (const ext of extensions) {
        const indexPath = `${resolvedPath}/index${ext}`;
        if (projectFiles[indexPath]) return indexPath;
    }

    return null;
}

export function validateImportResolution(projectFiles) {
    const issues = [];

    for (const [filePath, code] of Object.entries(projectFiles)) {
        if (!code || typeof code !== 'string') continue;
        if (/\.(css|html|json|md|svg|png|jpg)$/i.test(filePath)) continue;

        const imports = parseImports(code, filePath);

        for (const imp of imports) {
            const targetPath = resolveFileInProject(imp.resolvedPath, projectFiles);

            if (!targetPath) {
                issues.push({
                    type: 'FILE_NOT_FOUND',
                    file: filePath,
                    importedPath: imp.specifier,
                    resolvedPath: imp.resolvedPath,
                    severity: 'error',
                    message: `"${filePath}" imports from "${imp.specifier}" but no matching file found in project`,
                });
                continue;
            }

            if (imp.isNamespace) continue;

            const targetCode = projectFiles[targetPath];
            const targetExports = parseExports(targetCode);

            if (imp.defaultImport && imp.defaultImport !== 'React' && imp.defaultImport !== 'Fragment') {
                if (!targetExports.hasDefault) {
                    issues.push({
                        type: 'DEFAULT_EXPORT_MISSING',
                        file: filePath,
                        importedPath: imp.specifier,
                        targetFile: targetPath,
                        importName: imp.defaultImport,
                        severity: 'error',
                        message: `"${filePath}" imports default "${imp.defaultImport}" from "${targetPath}" but it has no default export`,
                        availableExports: targetExports.named,
                    });
                }
            }

            for (const namedImport of imp.namedImports) {
                if (namedImport === 'React' || namedImport === 'type') continue;
                if (!targetExports.named.includes(namedImport)) {
                    issues.push({
                        type: 'NAMED_EXPORT_MISSING',
                        file: filePath,
                        importedPath: imp.specifier,
                        targetFile: targetPath,
                        importName: namedImport,
                        severity: 'error',
                        message: `"${filePath}" imports named "${namedImport}" from "${targetPath}" but it's not exported`,
                        availableExports: [...targetExports.named, ...(targetExports.hasDefault ? ['(default)'] : [])],
                    });
                }
            }
        }
    }

    return issues;
}

export function auditPackageDependencies(projectFiles) {
    const packageJson = projectFiles['package.json'];
    if (!packageJson) return { missing: [], used: [], declared: [] };

    let pkg;
    try {
        pkg = JSON.parse(packageJson);
    } catch {
        return { missing: [], used: [], declared: [] };
    }

    const declared = new Set([
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
    ]);

    const builtins = new Set(['react', 'react-dom', 'path', 'fs', 'crypto', 'url', 'http', 'https', 'os', 'events']);

    const used = new Set();
    for (const [filePath, code] of Object.entries(projectFiles)) {
        if (!/\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(filePath)) continue;
        const importRe = /from\s+['"]([^'"]+)['"]/g;
        let m;
        while ((m = importRe.exec(code)) !== null) {
            const spec = m[1];
            if (spec.startsWith('.')) continue;
            const pkgName = spec.startsWith('@')
                ? spec.split('/').slice(0, 2).join('/')
                : spec.split('/')[0];
            if (pkgName) used.add(pkgName);
        }
    }

    const missing = [...used].filter(p => !declared.has(p) && !builtins.has(p));

    return { missing, used: [...used], declared: [...declared] };
}
