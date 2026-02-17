import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

let anthropic = null;

// ─── Supported Frameworks ────────────────────────────────────────────────────
export const FRAMEWORKS = [
    'vanilla-js', 'react', 'react-ts', 'nextjs', 'vue', 'svelte', 'angular', 'astro'
];

export const STYLING_OPTIONS = [
    'tailwind', 'plain-css', 'css-modules', 'styled-components', 'scss'
];

export const COMPLEXITY_LEVELS = ['simple', 'intermediate', 'advanced'];

export const PROJECT_TYPES = [
    'landing-page', 'web-app', 'dashboard', 'portfolio', 'ecommerce',
    'blog', 'documentation', 'saas', 'social', 'admin-panel', 'crm', 'game'
];

// ─── Analyzer Prompt ─────────────────────────────────────────────────────────
export const ANALYZER_PROMPT = `Analyze this web project request and reply with ONLY one JSON object. No other text.

User request: "{prompt}"
{frameworkHint}{stylingHint}

Reply with only this JSON (use exactly these keys):
{"projectType":"landing-page","features":["feature1","feature2"],"styling":"modern","complexity":"simple","framework":"vanilla-js","stylingFramework":"plain-css","colorScheme":"","layout":"","description":""}

Rules:
- projectType must be one of: landing-page, web-app, dashboard, portfolio, ecommerce, blog, documentation, saas, social, admin-panel, crm, game
- styling must be one of: modern, minimal, colorful, professional, elegant, creative, dark, glassmorphism, neumorphism
- complexity must be one of: simple, intermediate, advanced
- framework must be one of: vanilla-js, react, react-ts, nextjs, vue, svelte, angular, astro
- stylingFramework must be one of: tailwind, plain-css, css-modules, styled-components, scss
- description: 1-2 sentence summary of what will be built
- If user mentions React/Next/Vue/Svelte/Angular/Astro, use that framework
- If user mentions TypeScript with React, use react-ts
- If user mentions Tailwind, set stylingFramework to tailwind
- For complex apps (dashboards, SaaS, CRM, ecommerce), prefer react-ts or nextjs unless user specifies otherwise
- For simple sites (landing pages, portfolios, blogs), vanilla-js is fine unless user specifies otherwise`;

// ─── Planner Prompt ──────────────────────────────────────────────────────────
export const PLANNER_PROMPT = `Plan the file structure for this web project. Reply with ONLY one JSON object. No other text.

Requirements: {requirements}
Project type: {projectType}
Framework: {framework}
Styling: {stylingFramework}
Complexity: {complexity}

Reply with only this JSON:
{"files":[{"path":"...","purpose":"..."}],"techStack":["..."],"designSystem":{"primaryColor":"#4f46e5","fontFamily":"Inter"}}

FRAMEWORK-SPECIFIC FILE STRUCTURES:

vanilla-js:
- index.html, styles.css, script.js
- For intermediate+: add components/ folder, utils.js

react:
- index.html, src/App.jsx, src/main.jsx, src/index.css
- For intermediate+: src/components/*.jsx, src/hooks/, src/utils/
- package.json with react, react-dom dependencies

react-ts:
- index.html, src/App.tsx, src/main.tsx, src/index.css
- For intermediate+: src/components/*.tsx, src/hooks/, src/types/
- package.json, tsconfig.json

nextjs:
- app/layout.tsx, app/page.tsx, app/globals.css
- For intermediate+: app/components/*.tsx, app/api/ routes, app/lib/
- package.json, next.config.js, tailwind.config.js (if tailwind), tsconfig.json

vue:
- index.html, src/App.vue, src/main.js, src/style.css
- For intermediate+: src/components/*.vue, src/composables/
- package.json, vite.config.js

svelte:
- src/App.svelte, src/main.js, src/app.css
- For intermediate+: src/lib/components/*.svelte, src/lib/stores/
- package.json, vite.config.js, svelte.config.js

angular:
- src/app/app.component.ts, src/app/app.component.html, src/app/app.component.css
- src/main.ts, src/index.html, src/styles.css
- For intermediate+: src/app/components/, src/app/services/
- package.json, angular.json, tsconfig.json

astro:
- src/pages/index.astro, src/layouts/Layout.astro, src/styles/global.css
- For intermediate+: src/components/*.astro, src/content/
- package.json, astro.config.mjs

RULES:
- Always include the entry point file for the framework
- For tailwind styling, include tailwind.config.js
- For TypeScript frameworks, include tsconfig.json
- For package-based frameworks (everything except vanilla-js), include package.json
- Limit to 3-8 files for simple, 5-12 for intermediate, 8-20 for advanced
- Each file must have a clear purpose`;

// ─── Framework-Specific Code Generator Prompts ──────────────────────────────
const FRAMEWORK_PROMPTS = {
    'vanilla-js': `Generate complete, production-ready code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

RULES:
- Output ONLY the raw code. No markdown, no explanations, no code fences.
- For HTML: Complete <!DOCTYPE html> structure, semantic HTML5, proper meta tags, link to CSS/JS files
- For CSS: Modern responsive styles, CSS custom properties, mobile-first, smooth transitions, good typography
- For JS: Clean ES6+, proper event handling, DOMContentLoaded, modular functions
- Make it visually polished and professional - not a skeleton/placeholder
- Include real content relevant to the project description, not Lorem Ipsum
- Use Inter or system font stack`,

    'react': `Generate complete, production-ready React (JSX) code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

RULES:
- Output ONLY the raw code. No markdown, no explanations, no code fences.
- Use functional components with hooks (useState, useEffect, useCallback, useMemo)
- Use proper JSX syntax: className, htmlFor, onClick, onChange
- Export components as default exports
- Import React hooks from 'react'
- For App.jsx: import child components using relative paths (e.g., './components/Header')
- For CSS: use standard CSS or inline styles
- For index.html: include <div id="root"> and script tags
- For main.jsx: import ReactDOM and render App into #root
- Make it visually polished with real content - not placeholder text
- Handle state properly, avoid prop drilling for complex apps`,

    'react-ts': `Generate complete, production-ready React TypeScript code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

RULES:
- Output ONLY the raw code. No markdown, no explanations, no code fences.
- Use TypeScript with proper type annotations and interfaces
- Use functional components with typed props: React.FC<Props> or explicit return types
- Use proper hooks typing: useState<Type>, useRef<HTMLElement>
- Export components as default exports
- For .tsx files: import React from 'react'
- For App.tsx: import child components using relative paths
- For tsconfig.json: include strict mode, jsx: react-jsx
- For package.json: include @types/react, @types/react-dom, typescript
- Make it visually polished with real content`,

    'nextjs': `Generate complete, production-ready Next.js 14+ (App Router) code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

RULES:
- Output ONLY the raw code. No markdown, no explanations, no code fences.
- Use the App Router (app/ directory), NOT pages/ router
- For layout.tsx: export metadata, use children prop, include html/body tags
- For page.tsx: export default function, this is a Server Component by default
- Add 'use client' directive ONLY for components that use hooks/interactivity
- Use TypeScript throughout
- For API routes: use app/api/route.ts with GET/POST exports using NextRequest/NextResponse
- For tailwind: use utility classes extensively, include tailwind.config.js
- For next.config.js: use module.exports with appropriate settings
- For package.json: include next, react, react-dom as dependencies
- Make it visually polished with real content`,

    'vue': `Generate complete, production-ready Vue 3 code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

RULES:
- Output ONLY the raw code. No markdown, no explanations, no code fences.
- Use Vue 3 Composition API with <script setup> syntax
- .vue files must have <template>, <script setup>, and <style scoped> sections
- Use ref(), reactive(), computed(), watch(), onMounted() from 'vue'
- Use defineProps(), defineEmits() for component communication
- For main.js: import createApp from 'vue', import App.vue, mount to #app
- For index.html: include <div id="app">
- For vite.config.js: use @vitejs/plugin-vue
- Make it visually polished with real content
- Use proper Vue directives: v-if, v-for, v-model, v-on, v-bind, @click, :class`,

    'svelte': `Generate complete, production-ready Svelte code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

RULES:
- Output ONLY the raw code. No markdown, no explanations, no code fences.
- .svelte files have <script>, <style>, and HTML template sections
- Use Svelte reactivity: $: reactive statements, bind:, on:click
- Use {#if}, {#each}, {#await} template blocks
- Use writable/readable stores from 'svelte/store' for shared state
- For main.js: import App from './App.svelte', new App({ target: document.getElementById('app') })
- Export props with: export let propName
- For component events: use createEventDispatcher
- For svelte.config.js: use @sveltejs/vite-plugin-svelte
- Make it visually polished with real content`,

    'angular': `Generate complete, production-ready Angular code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

RULES:
- Output ONLY the raw code. No markdown, no explanations, no code fences.
- Use Angular 17+ with standalone components
- Components use @Component decorator with standalone: true, imports array
- Use signals for state: signal(), computed(), effect()
- Use TypeScript with proper decorators and typing
- For templates (.html): use Angular template syntax *ngIf, *ngFor, (click), [ngClass], {{ interpolation }}
- For services: use @Injectable({ providedIn: 'root' })
- For main.ts: use bootstrapApplication() with AppComponent
- For angular.json: minimal config with build/serve targets
- Make it visually polished with real content`,

    'astro': `Generate complete, production-ready Astro code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

RULES:
- Output ONLY the raw code. No markdown, no explanations, no code fences.
- .astro files have a frontmatter section (---) and HTML template
- Use Astro components for static content, island architecture for interactive
- Layouts wrap pages with <slot /> for content injection
- For pages: use file-based routing in src/pages/
- For astro.config.mjs: import { defineConfig } from 'astro/config'
- Use <style> tags with scoped styles by default
- For package.json: include astro as dependency
- Can use client:load, client:idle, client:visible for hydration
- Make it visually polished with real content`
};

// ─── Styling-Specific Instructions ──────────────────────────────────────────
const STYLING_INSTRUCTIONS = {
    'tailwind': `
TAILWIND CSS INSTRUCTIONS:
- Use Tailwind utility classes extensively (flex, grid, p-4, text-lg, bg-blue-500, etc.)
- Use responsive prefixes: sm:, md:, lg:, xl:
- Use hover:, focus:, active: state variants
- Use dark: variant for dark mode support
- In CSS files: use @tailwind base; @tailwind components; @tailwind utilities;
- In tailwind.config.js: extend theme with custom colors/fonts
- Avoid writing custom CSS except for complex animations`,

    'plain-css': `
CSS INSTRUCTIONS:
- Use CSS custom properties (variables) for theming
- Use CSS Grid and Flexbox for layout
- Use mobile-first responsive design with media queries
- Use smooth transitions and subtle animations
- Include a CSS reset/normalize at the top`,

    'css-modules': `
CSS MODULES INSTRUCTIONS:
- Name CSS files as *.module.css
- Import styles as: import styles from './Component.module.css'
- Use styles.className in JSX/template
- Compose styles with composes: keyword`,

    'styled-components': `
STYLED-COMPONENTS INSTRUCTIONS:
- Import styled from 'styled-components'
- Create styled components: const Button = styled.button\`...\`
- Use props for dynamic styling: ${'{'}props => props.primary ? '...' : '...'{'}'}
- Use ThemeProvider for theming`,

    'scss': `
SCSS INSTRUCTIONS:
- Use .scss file extension
- Use variables ($primary: #4f46e5), nesting, mixins, extends
- Use @use instead of @import
- Create partials (_variables.scss, _mixins.scss)`
};

// ─── Context Prompt for Inter-File Coherence ────────────────────────────────
export const buildContextPrompt = (generatedFiles) => {
    if (!generatedFiles || Object.keys(generatedFiles).length === 0) return '';

    const fileList = Object.entries(generatedFiles)
        .map(([path, content]) => {
            // Truncate large files to 1500 chars for context
            const truncated = content.length > 1500
                ? content.substring(0, 1500) + '\n// ... (truncated)'
                : content;
            return `--- ${path} ---\n${truncated}`;
        })
        .join('\n\n');

    return `\nPREVIOUSLY GENERATED FILES (reference these for consistency - match imports, class names, variable names, color schemes, component names):\n${fileList}\n`;
};

// ─── Build the Full Code Generation Prompt ──────────────────────────────────
export const buildCodeGenPrompt = ({ filePath, framework, projectType, styling, stylingFramework, userPrompt, generatedFiles }) => {
    const basePrompt = FRAMEWORK_PROMPTS[framework] || FRAMEWORK_PROMPTS['vanilla-js'];
    const stylingInst = STYLING_INSTRUCTIONS[stylingFramework] || STYLING_INSTRUCTIONS['plain-css'];
    const context = buildContextPrompt(generatedFiles);

    let prompt = basePrompt
        .replace(/{file_path}/g, filePath)
        .replace(/{projectType}/g, projectType || 'web-app')
        .replace(/{styling}/g, styling || 'modern')
        .replace(/{userPrompt}/g, userPrompt);

    prompt += stylingInst;
    prompt += context;

    return prompt;
};

// ─── Get Max Tokens Based on File Type ──────────────────────────────────────
export const getMaxTokens = (filePath, complexity) => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const isAdvanced = complexity === 'advanced';
    const isIntermediate = complexity === 'intermediate';

    // Config files are small
    if (['json', 'mjs', 'cjs'].includes(ext) ||
        filePath.includes('config') ||
        filePath.includes('tsconfig')) {
        return 2048;
    }

    // HTML/layout files
    if (ext === 'html' || filePath.includes('layout')) {
        return isAdvanced ? 8192 : 4096;
    }

    // Main app files
    if (filePath.includes('App.') || filePath.includes('page.')) {
        return isAdvanced ? 8192 : (isIntermediate ? 6144 : 4096);
    }

    // Style files
    if (['css', 'scss'].includes(ext)) {
        return isAdvanced ? 6144 : 4096;
    }

    // Component/JS files
    return isAdvanced ? 6144 : 4096;
};

// ─── Initialize Anthropic Client ────────────────────────────────────────────
export const initializeModel = async () => {
    if (anthropic) return { anthropic };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is missing in environment variables.");
    }

    try {
        console.log("Initializing Anthropic client...");
        anthropic = new Anthropic({ apiKey });
        console.log("Anthropic client initialized successfully");
        return { anthropic };
    } catch (e) {
        console.error("Failed to initialize Anthropic client:", e);
        throw e;
    }
};

// ─── Standard Completion (non-streaming) ────────────────────────────────────
export const generateCompletion = async (prompt, options = {}) => {
    try {
        await initializeModel();

        const systemPrompt = options.systemPrompt || "You are an expert full-stack developer. Output ONLY code. No explanations, no markdown code fences.";

        const response = await anthropic.messages.create({
            model: options.model || "claude-sonnet-4-20250514",
            max_tokens: options.maxTokens || 4096,
            temperature: options.temperature ?? 0.1,
            system: systemPrompt,
            messages: [
                { role: "user", content: prompt }
            ]
        });

        const textContent = response.content.find(block => block.type === 'text')?.text || '';
        return textContent;
    } catch (e) {
        console.error("Generation error:", e);
        throw e;
    }
};

// ─── Streaming Completion ───────────────────────────────────────────────────
export const generateCompletionStream = async (prompt, options = {}, onChunk) => {
    try {
        await initializeModel();

        const systemPrompt = options.systemPrompt || "You are an expert full-stack developer. Output ONLY code. No explanations, no markdown code fences.";

        const stream = anthropic.messages.stream({
            model: options.model || "claude-sonnet-4-20250514",
            max_tokens: options.maxTokens || 4096,
            temperature: options.temperature ?? 0.1,
            system: systemPrompt,
            messages: [
                { role: "user", content: prompt }
            ]
        });

        let fullText = '';

        stream.on('text', (text) => {
            fullText += text;
            if (onChunk && typeof onChunk === 'function') {
                onChunk(text, fullText);
            }
        });

        const finalMessage = await stream.finalMessage();
        return fullText;
    } catch (e) {
        console.error("Streaming generation error:", e);
        throw e;
    }
};
