import { describe, it } from 'node:test';
import assert from 'node:assert';
import { checkCrossFileConsistency } from '../../src/services/crossFileConsistency.js';

describe('checkCrossFileConsistency — HTML class refs vs CSS', () => {
    it('reports HTML class with no matching CSS rule', () => {
        const files = {
            'index.html': '<div class="hero"></div><div class="cta"></div>',
            'styles.css': '.hero { color: red; }',
        };
        const { issues } = checkCrossFileConsistency(files);
        const orphans = issues.filter(i => i.subtype === 'HTML_CLASS_NOT_IN_CSS');
        assert.strictEqual(orphans.length, 1);
        assert.strictEqual(orphans[0].details.className, 'cta');
    });

    it('passes when every HTML class has a CSS rule', () => {
        const files = {
            'index.html': '<div class="hero cta"></div>',
            'styles.css': '.hero {} .cta {}',
        };
        const { issues } = checkCrossFileConsistency(files);
        const orphans = issues.filter(i => i.subtype === 'HTML_CLASS_NOT_IN_CSS');
        assert.strictEqual(orphans.length, 0);
    });

    it('skips Tailwind-shaped classes when tailwind.config exists', () => {
        const files = {
            'index.html': '<div class="flex p-4 bg-blue-500 text-white"></div>',
            'styles.css': '/* nothing */',
            'tailwind.config.js': 'module.exports = {};',
        };
        const { issues } = checkCrossFileConsistency(files);
        const orphans = issues.filter(i => i.subtype === 'HTML_CLASS_NOT_IN_CSS');
        assert.strictEqual(orphans.length, 0);
    });

    it('flags Tailwind classes WITHOUT a config', () => {
        const files = {
            'index.html': '<div class="flex p-4 bg-blue-500 text-white items-center justify-between gap-2"></div>',
            'styles.css': '/* nothing */',
        };
        const { issues } = checkCrossFileConsistency(files);
        const tw = issues.filter(i => i.subtype === 'TAILWIND_NO_CONFIG');
        assert.strictEqual(tw.length, 1);
    });
});

describe('checkCrossFileConsistency — JS DOM target validation', () => {
    it('flags getElementById() targets not present in HTML', () => {
        const files = {
            'index.html': '<div id="todo-list"></div>',
            'script.js': 'document.getElementById("task-list").innerHTML = "";',
        };
        const { issues } = checkCrossFileConsistency(files);
        const missing = issues.filter(i => i.subtype === 'JS_TARGET_MISSING');
        assert.strictEqual(missing.length, 1);
        assert.strictEqual(missing[0].details.target, 'task-list');
        assert.deepStrictEqual(missing[0].details.availableIds, ['todo-list']);
    });

    it('flags querySelector("#x") targets not in HTML', () => {
        const files = {
            'index.html': '<div id="root"></div>',
            'script.js': 'document.querySelector("#main").focus();',
        };
        const { issues } = checkCrossFileConsistency(files);
        const missing = issues.filter(i => i.subtype === 'JS_TARGET_MISSING' && i.details.targetType === 'id');
        assert.strictEqual(missing.length, 1);
        assert.strictEqual(missing[0].details.target, 'main');
    });

    it('flags querySelector(".x") class targets not in HTML', () => {
        const files = {
            'index.html': '<button class="primary"></button>',
            'script.js': 'document.querySelector(".secondary-btn").click();',
        };
        const { issues } = checkCrossFileConsistency(files);
        const missing = issues.filter(i => i.subtype === 'JS_TARGET_MISSING' && i.details.targetType === 'class');
        assert.strictEqual(missing.length, 1);
    });

    it('passes when JS targets exist in HTML', () => {
        const files = {
            'index.html': '<div id="app"><button class="add-btn"></button></div>',
            'script.js': 'document.getElementById("app"); document.querySelector(".add-btn");',
        };
        const { issues } = checkCrossFileConsistency(files);
        const missing = issues.filter(i => i.subtype === 'JS_TARGET_MISSING');
        assert.strictEqual(missing.length, 0);
    });
});

describe('checkCrossFileConsistency — localStorage key drift', () => {
    it('flags getItem("a") with setItem("b") (one of each)', () => {
        const files = {
            'index.html': '<div></div>',
            'script.js': 'localStorage.setItem("todos", "[]"); const x = localStorage.getItem("tasks");',
        };
        const { issues } = checkCrossFileConsistency(files);
        const drift = issues.filter(i => i.subtype === 'STORAGE_KEY_DRIFT');
        assert.ok(drift.length >= 1);
        assert.match(drift[0].message, /tasks/);
        assert.match(drift[0].message, /todos/);
    });

    it('passes when get/set use the same key', () => {
        const files = {
            'index.html': '<div></div>',
            'script.js': 'localStorage.setItem("tasks", "[]"); localStorage.getItem("tasks");',
        };
        const { issues } = checkCrossFileConsistency(files);
        const drift = issues.filter(i => i.subtype === 'STORAGE_KEY_DRIFT');
        assert.strictEqual(drift.length, 0);
    });

    it('flags drift across multiple JS files', () => {
        const files = {
            'index.html': '<div></div>',
            'storage.js': 'localStorage.setItem("user-tasks", JSON.stringify(t));',
            'app.js': 'const tasks = JSON.parse(localStorage.getItem("user_tasks") || "[]");',
        };
        const { issues } = checkCrossFileConsistency(files);
        const drift = issues.filter(i => i.subtype === 'STORAGE_KEY_DRIFT');
        assert.ok(drift.length >= 1);
    });
});

describe('checkCrossFileConsistency — non-HTML projects', () => {
    it('returns no issues when no HTML files are present (React/TS handled elsewhere)', () => {
        const files = {
            'src/App.tsx': 'const App = () => <div>hello</div>;',
            'src/main.tsx': 'import App from "./App";',
        };
        const { issues } = checkCrossFileConsistency(files);
        assert.strictEqual(issues.length, 0);
    });
});

describe('checkCrossFileConsistency — robustness', () => {
    it('does not crash on empty files', () => {
        const files = { 'index.html': '', 'styles.css': '', 'script.js': '' };
        const { issues } = checkCrossFileConsistency(files);
        assert.ok(Array.isArray(issues));
    });

    it('reproduces the user-reported vanilla-js todo bug', () => {
        // Simulating the actual bug: HTML markup uses classes, but CSS file
        // got mislabelled and contains a reset only — no class definitions.
        const files = {
            'index.html': '<div class="app-header"><h1 class="app-title">Todo</h1></div>',
            'styles.css': 'body { line-height: 1.5; } * { box-sizing: border-box; }',
            'script.js': 'console.log("ok");',
        };
        const { issues } = checkCrossFileConsistency(files);
        const orphans = issues.filter(i => i.subtype === 'HTML_CLASS_NOT_IN_CSS');
        const orphanNames = orphans.map(o => o.details.className).sort();
        assert.deepStrictEqual(orphanNames, ['app-header', 'app-title']);
    });
});
