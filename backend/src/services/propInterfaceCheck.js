// ═══════════════════════════════════════════════════════════════════════════════
// Prop-Interface Consistency Check
//
// Detects mismatches between a component's declared prop interface and the
// actual JSX call sites that render it. Fixes the class of bug where a parent
// passes <X stats={s}/> but X declares { tasks } — the most common cause of
// "the UI rendered but nothing wires together" output failures.
//
// Issues are emitted in a shape consumable by the existing reviewer→fixer loop.
// ═══════════════════════════════════════════════════════════════════════════════

import { parse } from '@babel/core';
import logger from './logger.js';

/**
 * @typedef {object} PropInterfaceIssue
 * @property {string} type        — 'PROP_MISMATCH'
 * @property {string} subtype     — 'EXTRA_PROP' | 'MISSING_REQUIRED' | 'NO_INTERFACE'
 * @property {string} file        — file containing the problem (the parent)
 * @property {string} component   — component being mis-called
 * @property {string} message     — human-readable description
 * @property {string} severity    — 'error' | 'warning'
 * @property {object} [details]
 */

/**
 * Run the prop-interface check on a project's files.
 *
 * @param {Record<string, string>} files - All project files keyed by relative path
 * @returns {{ issues: PropInterfaceIssue[], byFile: Record<string, PropInterfaceIssue[]> }}
 */
export function checkPropInterfaces(files) {
    const components = {};      // componentName → { filePath, props: { name → required }, hasInterface }
    const callSites = [];       // { parentFile, componentName, propsPassed: Set<string> }

    // 1) Parse every component file to extract its declared props interface
    for (const [filePath, content] of Object.entries(files)) {
        if (!isComponentFile(filePath)) continue;
        if (typeof content !== 'string' || content.length === 0) continue;
        try {
            const ast = parseSource(content, filePath);
            if (!ast) continue;
            const found = extractDeclaredProps(ast, filePath);
            for (const c of found) components[c.name] = c;
        } catch (err) {
            logger.debug?.('propInterfaceCheck: parse failed (component scan)', { file: filePath, error: err.message });
        }
    }

    // 2) Parse every file again to find JSX call sites of those components
    for (const [filePath, content] of Object.entries(files)) {
        if (!isComponentFile(filePath)) continue;
        if (typeof content !== 'string' || content.length === 0) continue;
        try {
            const ast = parseSource(content, filePath);
            if (!ast) continue;
            const sites = extractJsxCallSites(ast, filePath, components);
            callSites.push(...sites);
        } catch (err) {
            logger.debug?.('propInterfaceCheck: parse failed (call-site scan)', { file: filePath, error: err.message });
        }
    }

    // 3) Compare each call site against the declared interface
    const issues = [];
    for (const site of callSites) {
        const decl = components[site.componentName];
        if (!decl) continue; // Component not in project — handled by import resolver instead.

        if (!decl.hasInterface) {
            // Component declared but no Props interface/type — it accepts anything.
            // Only flag as warning if the parent passes anything beyond `key`/`ref`/`children`.
            const passed = [...site.propsPassed].filter(p => !RESERVED_REACT_PROPS.has(p));
            if (passed.length > 0) {
                issues.push({
                    type: 'PROP_MISMATCH',
                    subtype: 'NO_INTERFACE',
                    file: site.parentFile,
                    component: site.componentName,
                    message: `Component <${site.componentName}> in ${decl.filePath} has no Props interface, but ${site.parentFile} passes: ${passed.join(', ')}. Add a typed Props interface to ${decl.filePath} that declares these props.`,
                    severity: 'warning',
                    details: { declaredFile: decl.filePath, propsPassed: passed },
                });
            }
            continue;
        }

        const declared = decl.props;
        const declaredNames = new Set(Object.keys(declared));
        const passed = new Set([...site.propsPassed].filter(p => !RESERVED_REACT_PROPS.has(p)));

        // Extra props: parent passes a name that isn't in the declared interface
        const extras = [...passed].filter(p => !declaredNames.has(p));
        for (const extra of extras) {
            issues.push({
                type: 'PROP_MISMATCH',
                subtype: 'EXTRA_PROP',
                file: site.parentFile,
                component: site.componentName,
                message: `<${site.componentName} ${extra}={...}/> in ${site.parentFile}: prop "${extra}" is not declared in ${decl.filePath}'s Props interface (declared: ${[...declaredNames].join(', ') || 'none'}). Either add "${extra}" to the interface in ${decl.filePath}, or change the call site to use a declared prop name.`,
                severity: 'error',
                details: {
                    declaredFile: decl.filePath,
                    declaredProps: [...declaredNames],
                    extraProp: extra,
                },
            });
        }

        // Missing required props: declared as required but not passed
        const missing = [...declaredNames].filter(p => declared[p] === true && !passed.has(p));
        for (const miss of missing) {
            issues.push({
                type: 'PROP_MISMATCH',
                subtype: 'MISSING_REQUIRED',
                file: site.parentFile,
                component: site.componentName,
                message: `<${site.componentName}/> in ${site.parentFile} is missing required prop "${miss}" (declared in ${decl.filePath}). Pass "${miss}={...}" at the call site.`,
                severity: 'error',
                details: { declaredFile: decl.filePath, missingProp: miss },
            });
        }
    }

    // Group by file for the fixer's convenience
    const byFile = {};
    for (const issue of issues) {
        if (!byFile[issue.file]) byFile[issue.file] = [];
        byFile[issue.file].push(issue);
    }

    return { issues, byFile };
}

// ─── Internals ─────────────────────────────────────────────────────────────────

const RESERVED_REACT_PROPS = new Set(['key', 'ref', 'children', 'className', 'style', 'id']);

function isComponentFile(filePath) {
    return /\.(jsx|tsx)$/i.test(filePath);
}

function parseSource(code, filePath) {
    try {
        return parse(code, {
            babelrc: false,
            configFile: false,
            ast: true,
            sourceType: 'module',
            filename: filePath,
            presets: [
                ['@babel/preset-env', { targets: { esmodules: true } }],
                ['@babel/preset-react', { runtime: 'automatic' }],
                ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
            ],
            plugins: [],
            // Don't transform — we just want the AST
            code: false,
        });
    } catch {
        return null;
    }
}

/**
 * Walk the AST finding `interface XProps { ... }`, `type XProps = { ... }`,
 * and `const X: React.FC<{ ... }>`. Returns one entry per component file.
 */
function extractDeclaredProps(ast, filePath) {
    const found = [];
    const propsByInterface = {};

    walk(ast.program, (node) => {
        // 1. interface FooProps { ... }
        if (node.type === 'TSInterfaceDeclaration') {
            const name = node.id?.name;
            if (name && name.endsWith('Props')) {
                propsByInterface[name] = collectTypeMembers(node.body?.body || []);
            }
        }
        // 2. type FooProps = { ... } (or = type)
        if (node.type === 'TSTypeAliasDeclaration') {
            const name = node.id?.name;
            if (name && name.endsWith('Props') && node.typeAnnotation?.type === 'TSTypeLiteral') {
                propsByInterface[name] = collectTypeMembers(node.typeAnnotation.members || []);
            }
        }
    });

    // Now find the component(s) and link them to a Props interface (by suffix-matching)
    walk(ast.program, (node) => {
        let componentName = null;
        let inlinePropsAst = null;
        let referencesInterface = null;

        // const Foo: React.FC<FooProps> = ...
        // const Foo = (props: FooProps) => ...
        // const Foo = ({ a, b }: { a: string }) => ...
        // function Foo(props: FooProps) { ... }
        // export default function Foo(...) { ... }

        if (node.type === 'VariableDeclaration') {
            for (const decl of node.declarations || []) {
                const name = decl.id?.name;
                if (!name || !/^[A-Z]/.test(name)) continue;
                const init = decl.init;
                if (!init) continue;
                // Capture FC<FooProps> on the variable's type annotation
                const typeAnno = decl.id?.typeAnnotation?.typeAnnotation;
                if (typeAnno?.type === 'TSTypeReference' && typeAnno.typeParameters?.params?.[0]) {
                    const inner = typeAnno.typeParameters.params[0];
                    if (inner.type === 'TSTypeReference') referencesInterface = inner.typeName?.name;
                    if (inner.type === 'TSTypeLiteral') inlinePropsAst = inner.members;
                }
                if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
                    const param0 = init.params?.[0];
                    if (param0) {
                        const tref = param0.typeAnnotation?.typeAnnotation;
                        if (tref?.type === 'TSTypeReference') referencesInterface = referencesInterface || tref.typeName?.name;
                        if (tref?.type === 'TSTypeLiteral') inlinePropsAst = inlinePropsAst || tref.members;
                    }
                    componentName = name;
                }
            }
        }
        if (node.type === 'FunctionDeclaration') {
            const name = node.id?.name;
            if (name && /^[A-Z]/.test(name)) {
                const param0 = node.params?.[0];
                if (param0) {
                    const tref = param0.typeAnnotation?.typeAnnotation;
                    if (tref?.type === 'TSTypeReference') referencesInterface = tref.typeName?.name;
                    if (tref?.type === 'TSTypeLiteral') inlinePropsAst = tref.members;
                }
                componentName = name;
            }
        }
        if (node.type === 'ExportDefaultDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
            const name = node.declaration.id?.name;
            if (name && /^[A-Z]/.test(name)) {
                const param0 = node.declaration.params?.[0];
                if (param0) {
                    const tref = param0.typeAnnotation?.typeAnnotation;
                    if (tref?.type === 'TSTypeReference') referencesInterface = tref.typeName?.name;
                    if (tref?.type === 'TSTypeLiteral') inlinePropsAst = tref.members;
                }
                componentName = name;
            }
        }

        if (!componentName) return;

        const props = referencesInterface && propsByInterface[referencesInterface]
            ? propsByInterface[referencesInterface]
            : (inlinePropsAst ? collectTypeMembers(inlinePropsAst) : null);

        found.push({
            name: componentName,
            filePath,
            props: props || {},
            hasInterface: !!props,
        });
    });

    return found;
}

/**
 * Convert TS interface body members into { propName → isRequired } map.
 * Members can be TSPropertySignature with optional `optional: true` flag.
 */
function collectTypeMembers(members) {
    const result = {};
    for (const m of members) {
        if (m.type !== 'TSPropertySignature') continue;
        const key = m.key?.name || m.key?.value;
        if (!key) continue;
        result[key] = m.optional !== true; // required by default
    }
    return result;
}

/**
 * Walk the AST finding JSX usages of any known component.
 */
function extractJsxCallSites(ast, parentFile, components) {
    const sites = [];
    const knownComponentNames = new Set(Object.keys(components));

    walk(ast.program, (node) => {
        if (node.type !== 'JSXOpeningElement') return;
        const tagName = node.name?.name;
        if (!tagName || !/^[A-Z]/.test(tagName)) return;
        // Could be a different name due to import-as; we still check
        if (!knownComponentNames.has(tagName)) return;

        const propsPassed = new Set();
        for (const attr of node.attributes || []) {
            if (attr.type === 'JSXAttribute') {
                const name = attr.name?.name;
                if (name) propsPassed.add(name);
            } else if (attr.type === 'JSXSpreadAttribute') {
                // Spread — we can't statically know, treat as "all declared satisfied"
                propsPassed.add('__spread__');
            }
        }

        sites.push({
            parentFile,
            componentName: tagName,
            propsPassed,
        });
    });

    return sites;
}

/**
 * Lightweight AST walker — visits every node in the tree.
 * Avoids depending on @babel/traverse (slightly different API surface).
 */
function walk(node, visit) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (const child of node) walk(child, visit);
        return;
    }
    if (typeof node.type === 'string') visit(node);
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'range') continue;
        const child = node[key];
        if (child && typeof child === 'object') walk(child, visit);
    }
}
