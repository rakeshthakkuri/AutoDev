import config from '../config.js';
import { generateCompletion, ANALYZER_PROMPT, PLANNER_PROMPT, FRAMEWORKS, STYLING_OPTIONS } from './llm.js';
import { getCachedAnalysis, setCachedAnalysis, getCachedPlan, setCachedPlan } from './cache.js';
import logger from './logger.js';
import { FILE_COUNT_BOUNDS } from '../agents/planner/validators.js';

// ─── Framework-Specific File Structures ──────────────────────────────────────
const FRAMEWORK_FILE_STRUCTURES = {
    'vanilla-js': {
        simple: [
            { path: 'index.html', purpose: 'Main HTML page' },
            { path: 'styles.css', purpose: 'Stylesheet' },
            { path: 'script.js', purpose: 'Application logic' }
        ],
        intermediate: [
            { path: 'index.html', purpose: 'Main HTML page' },
            { path: 'styles.css', purpose: 'Main stylesheet' },
            { path: 'script.js', purpose: 'Main application logic' },
            { path: 'components.js', purpose: 'Reusable UI components' },
            { path: 'utils.js', purpose: 'Helper utilities' }
        ],
        advanced: [
            { path: 'index.html', purpose: 'Main HTML page' },
            { path: 'styles.css', purpose: 'Main stylesheet' },
            { path: 'animations.css', purpose: 'Animations and transitions' },
            { path: 'script.js', purpose: 'Main application entry point' },
            { path: 'components.js', purpose: 'UI component library' },
            { path: 'router.js', purpose: 'Client-side routing' },
            { path: 'store.js', purpose: 'State management' },
            { path: 'api.js', purpose: 'API client and data fetching' },
            { path: 'utils.js', purpose: 'Helper utilities' }
        ]
    },
    'react': {
        simple: [
            { path: 'index.html', purpose: 'HTML entry point with root div' },
            { path: 'src/main.jsx', purpose: 'React DOM render entry' },
            { path: 'src/App.jsx', purpose: 'Main App component' },
            { path: 'src/index.css', purpose: 'Global styles' },
            { path: 'package.json', purpose: 'Dependencies and scripts' }
        ],
        intermediate: [
            { path: 'index.html', purpose: 'HTML entry point' },
            { path: 'src/main.jsx', purpose: 'React DOM render entry' },
            { path: 'src/App.jsx', purpose: 'Main App component with routing' },
            { path: 'src/index.css', purpose: 'Global styles' },
            { path: 'src/components/Header.jsx', purpose: 'Header/navigation component' },
            { path: 'src/components/Hero.jsx', purpose: 'Hero section component' },
            { path: 'src/components/Features.jsx', purpose: 'Features section component' },
            { path: 'src/components/Footer.jsx', purpose: 'Footer component' },
            { path: 'package.json', purpose: 'Dependencies and scripts' }
        ],
        advanced: [
            { path: 'index.html', purpose: 'HTML entry point' },
            { path: 'src/main.jsx', purpose: 'React DOM render entry' },
            { path: 'src/App.jsx', purpose: 'Main App component with routing' },
            { path: 'src/index.css', purpose: 'Global styles' },
            { path: 'src/components/Header.jsx', purpose: 'Header/navigation component' },
            { path: 'src/components/Hero.jsx', purpose: 'Hero section component' },
            { path: 'src/components/Features.jsx', purpose: 'Features section component' },
            { path: 'src/components/Footer.jsx', purpose: 'Footer component' },
            { path: 'src/components/Card.jsx', purpose: 'Reusable card component' },
            { path: 'src/hooks/useLocalStorage.js', purpose: 'Custom localStorage hook' },
            { path: 'src/utils/helpers.js', purpose: 'Utility functions' },
            { path: 'src/context/ThemeContext.jsx', purpose: 'Theme context provider' },
            { path: 'package.json', purpose: 'Dependencies and scripts' }
        ]
    },
    'react-ts': {
        simple: [
            { path: 'index.html', purpose: 'HTML entry point' },
            { path: 'src/main.tsx', purpose: 'React DOM render entry' },
            { path: 'src/App.tsx', purpose: 'Main App component' },
            { path: 'src/index.css', purpose: 'Global styles' },
            { path: 'package.json', purpose: 'Dependencies and scripts' },
            { path: 'tsconfig.json', purpose: 'TypeScript configuration' }
        ],
        intermediate: [
            { path: 'index.html', purpose: 'HTML entry point' },
            { path: 'src/main.tsx', purpose: 'React DOM render entry' },
            { path: 'src/App.tsx', purpose: 'Main App component' },
            { path: 'src/index.css', purpose: 'Global styles' },
            { path: 'src/types/index.ts', purpose: 'TypeScript type definitions' },
            { path: 'src/components/Header.tsx', purpose: 'Header/navigation component' },
            { path: 'src/components/Hero.tsx', purpose: 'Hero section component' },
            { path: 'src/components/Features.tsx', purpose: 'Features section component' },
            { path: 'src/components/Footer.tsx', purpose: 'Footer component' },
            { path: 'package.json', purpose: 'Dependencies and scripts' },
            { path: 'tsconfig.json', purpose: 'TypeScript configuration' }
        ],
        advanced: [
            { path: 'index.html', purpose: 'HTML entry point' },
            { path: 'src/main.tsx', purpose: 'React DOM render entry' },
            { path: 'src/App.tsx', purpose: 'Main App component' },
            { path: 'src/index.css', purpose: 'Global styles' },
            { path: 'src/types/index.ts', purpose: 'TypeScript type definitions' },
            { path: 'src/components/Header.tsx', purpose: 'Header/navigation' },
            { path: 'src/components/Hero.tsx', purpose: 'Hero section' },
            { path: 'src/components/Features.tsx', purpose: 'Features grid' },
            { path: 'src/components/Footer.tsx', purpose: 'Footer' },
            { path: 'src/components/Card.tsx', purpose: 'Reusable card' },
            { path: 'src/hooks/useLocalStorage.ts', purpose: 'Custom hook' },
            { path: 'src/utils/helpers.ts', purpose: 'Utilities' },
            { path: 'src/context/ThemeContext.tsx', purpose: 'Theme provider' },
            { path: 'package.json', purpose: 'Dependencies and scripts' },
            { path: 'tsconfig.json', purpose: 'TypeScript configuration' }
        ]
    },
    'nextjs': {
        simple: [
            { path: 'app/layout.tsx', purpose: 'Root layout with metadata' },
            { path: 'app/page.tsx', purpose: 'Home page' },
            { path: 'app/globals.css', purpose: 'Global styles' },
            { path: 'package.json', purpose: 'Dependencies and scripts' },
            { path: 'next.config.js', purpose: 'Next.js configuration' },
            { path: 'tsconfig.json', purpose: 'TypeScript configuration' }
        ],
        intermediate: [
            { path: 'app/layout.tsx', purpose: 'Root layout with metadata' },
            { path: 'app/page.tsx', purpose: 'Home page' },
            { path: 'app/globals.css', purpose: 'Global styles' },
            { path: 'app/components/Header.tsx', purpose: 'Header component' },
            { path: 'app/components/Hero.tsx', purpose: 'Hero section' },
            { path: 'app/components/Features.tsx', purpose: 'Features section' },
            { path: 'app/components/Footer.tsx', purpose: 'Footer component' },
            { path: 'package.json', purpose: 'Dependencies and scripts' },
            { path: 'next.config.js', purpose: 'Next.js configuration' },
            { path: 'tailwind.config.js', purpose: 'Tailwind configuration' },
            { path: 'tsconfig.json', purpose: 'TypeScript configuration' }
        ],
        advanced: [
            { path: 'app/layout.tsx', purpose: 'Root layout' },
            { path: 'app/page.tsx', purpose: 'Home page' },
            { path: 'app/globals.css', purpose: 'Global styles' },
            { path: 'app/about/page.tsx', purpose: 'About page' },
            { path: 'app/components/Header.tsx', purpose: 'Header/nav' },
            { path: 'app/components/Hero.tsx', purpose: 'Hero section' },
            { path: 'app/components/Features.tsx', purpose: 'Features' },
            { path: 'app/components/Footer.tsx', purpose: 'Footer' },
            { path: 'app/components/Card.tsx', purpose: 'Reusable card' },
            { path: 'app/lib/utils.ts', purpose: 'Utility functions' },
            { path: 'app/api/hello/route.ts', purpose: 'Sample API route' },
            { path: 'package.json', purpose: 'Dependencies and scripts' },
            { path: 'next.config.js', purpose: 'Next.js configuration' },
            { path: 'tailwind.config.js', purpose: 'Tailwind configuration' },
            { path: 'tsconfig.json', purpose: 'TypeScript configuration' }
        ]
    },
    'vue': {
        simple: [
            { path: 'index.html', purpose: 'HTML entry point with #app' },
            { path: 'src/main.js', purpose: 'Vue app creation and mount' },
            { path: 'src/App.vue', purpose: 'Root App component' },
            { path: 'src/style.css', purpose: 'Global styles' },
            { path: 'package.json', purpose: 'Dependencies and scripts' },
            { path: 'vite.config.js', purpose: 'Vite + Vue plugin config' }
        ],
        intermediate: [
            { path: 'index.html', purpose: 'HTML entry point' },
            { path: 'src/main.js', purpose: 'Vue app creation and mount' },
            { path: 'src/App.vue', purpose: 'Root App component' },
            { path: 'src/style.css', purpose: 'Global styles' },
            { path: 'src/components/Header.vue', purpose: 'Header/navigation' },
            { path: 'src/components/Hero.vue', purpose: 'Hero section' },
            { path: 'src/components/Features.vue', purpose: 'Features section' },
            { path: 'src/components/Footer.vue', purpose: 'Footer' },
            { path: 'package.json', purpose: 'Dependencies and scripts' },
            { path: 'vite.config.js', purpose: 'Vite configuration' }
        ],
        advanced: [
            { path: 'index.html', purpose: 'HTML entry point' },
            { path: 'src/main.js', purpose: 'Vue app creation' },
            { path: 'src/App.vue', purpose: 'Root component' },
            { path: 'src/style.css', purpose: 'Global styles' },
            { path: 'src/components/Header.vue', purpose: 'Header/nav' },
            { path: 'src/components/Hero.vue', purpose: 'Hero section' },
            { path: 'src/components/Features.vue', purpose: 'Features' },
            { path: 'src/components/Footer.vue', purpose: 'Footer' },
            { path: 'src/components/Card.vue', purpose: 'Reusable card' },
            { path: 'src/composables/useTheme.js', purpose: 'Theme composable' },
            { path: 'src/stores/app.js', purpose: 'Pinia store' },
            { path: 'package.json', purpose: 'Dependencies and scripts' },
            { path: 'vite.config.js', purpose: 'Vite configuration' }
        ]
    },
    'svelte': {
        simple: [
            { path: 'src/App.svelte', purpose: 'Root Svelte component' },
            { path: 'src/main.js', purpose: 'App mount entry point' },
            { path: 'src/app.css', purpose: 'Global styles' },
            { path: 'package.json', purpose: 'Dependencies and scripts' },
            { path: 'vite.config.js', purpose: 'Vite + Svelte config' },
            { path: 'svelte.config.js', purpose: 'Svelte compiler config' }
        ],
        intermediate: [
            { path: 'src/App.svelte', purpose: 'Root component' },
            { path: 'src/main.js', purpose: 'App mount entry' },
            { path: 'src/app.css', purpose: 'Global styles' },
            { path: 'src/lib/components/Header.svelte', purpose: 'Header' },
            { path: 'src/lib/components/Hero.svelte', purpose: 'Hero section' },
            { path: 'src/lib/components/Features.svelte', purpose: 'Features' },
            { path: 'src/lib/components/Footer.svelte', purpose: 'Footer' },
            { path: 'package.json', purpose: 'Dependencies and scripts' },
            { path: 'vite.config.js', purpose: 'Vite configuration' },
            { path: 'svelte.config.js', purpose: 'Svelte config' }
        ],
        advanced: [
            { path: 'src/App.svelte', purpose: 'Root component' },
            { path: 'src/main.js', purpose: 'App mount entry' },
            { path: 'src/app.css', purpose: 'Global styles' },
            { path: 'src/lib/components/Header.svelte', purpose: 'Header' },
            { path: 'src/lib/components/Hero.svelte', purpose: 'Hero section' },
            { path: 'src/lib/components/Features.svelte', purpose: 'Features' },
            { path: 'src/lib/components/Footer.svelte', purpose: 'Footer' },
            { path: 'src/lib/components/Card.svelte', purpose: 'Reusable card' },
            { path: 'src/lib/stores/theme.js', purpose: 'Theme store' },
            { path: 'src/lib/utils/helpers.js', purpose: 'Utilities' },
            { path: 'package.json', purpose: 'Dependencies and scripts' },
            { path: 'vite.config.js', purpose: 'Vite configuration' },
            { path: 'svelte.config.js', purpose: 'Svelte configuration' }
        ]
    },
    'angular': {
        simple: [
            { path: 'src/index.html', purpose: 'HTML entry point' },
            { path: 'src/main.ts', purpose: 'Angular bootstrap entry' },
            { path: 'src/app/app.component.ts', purpose: 'Root component class' },
            { path: 'src/app/app.component.html', purpose: 'Root component template' },
            { path: 'src/app/app.component.css', purpose: 'Root component styles' },
            { path: 'src/styles.css', purpose: 'Global styles' },
            { path: 'package.json', purpose: 'Dependencies and scripts' },
            { path: 'tsconfig.json', purpose: 'TypeScript configuration' },
            { path: 'angular.json', purpose: 'Angular CLI configuration' }
        ],
        intermediate: [
            { path: 'src/index.html', purpose: 'HTML entry point' },
            { path: 'src/main.ts', purpose: 'Angular bootstrap' },
            { path: 'src/app/app.component.ts', purpose: 'Root component' },
            { path: 'src/app/app.component.html', purpose: 'Root template' },
            { path: 'src/app/app.component.css', purpose: 'Root styles' },
            { path: 'src/app/components/header/header.component.ts', purpose: 'Header component' },
            { path: 'src/app/components/header/header.component.html', purpose: 'Header template' },
            { path: 'src/app/components/hero/hero.component.ts', purpose: 'Hero component' },
            { path: 'src/app/components/hero/hero.component.html', purpose: 'Hero template' },
            { path: 'src/styles.css', purpose: 'Global styles' },
            { path: 'package.json', purpose: 'Dependencies' },
            { path: 'tsconfig.json', purpose: 'TypeScript config' },
            { path: 'angular.json', purpose: 'Angular config' }
        ],
        advanced: [
            { path: 'src/index.html', purpose: 'HTML entry point' },
            { path: 'src/main.ts', purpose: 'Angular bootstrap' },
            { path: 'src/app/app.component.ts', purpose: 'Root component' },
            { path: 'src/app/app.component.html', purpose: 'Root template' },
            { path: 'src/app/app.component.css', purpose: 'Root styles' },
            { path: 'src/app/app.routes.ts', purpose: 'Route definitions' },
            { path: 'src/app/components/header/header.component.ts', purpose: 'Header' },
            { path: 'src/app/components/header/header.component.html', purpose: 'Header template' },
            { path: 'src/app/components/hero/hero.component.ts', purpose: 'Hero' },
            { path: 'src/app/components/hero/hero.component.html', purpose: 'Hero template' },
            { path: 'src/app/components/features/features.component.ts', purpose: 'Features' },
            { path: 'src/app/components/features/features.component.html', purpose: 'Features template' },
            { path: 'src/app/services/data.service.ts', purpose: 'Data service' },
            { path: 'src/styles.css', purpose: 'Global styles' },
            { path: 'package.json', purpose: 'Dependencies' },
            { path: 'tsconfig.json', purpose: 'TypeScript config' },
            { path: 'angular.json', purpose: 'Angular config' }
        ]
    },
    'astro': {
        simple: [
            { path: 'src/pages/index.astro', purpose: 'Home page' },
            { path: 'src/layouts/Layout.astro', purpose: 'Base layout' },
            { path: 'src/styles/global.css', purpose: 'Global styles' },
            { path: 'package.json', purpose: 'Dependencies and scripts' },
            { path: 'astro.config.mjs', purpose: 'Astro configuration' }
        ],
        intermediate: [
            { path: 'src/pages/index.astro', purpose: 'Home page' },
            { path: 'src/layouts/Layout.astro', purpose: 'Base layout' },
            { path: 'src/components/Header.astro', purpose: 'Header component' },
            { path: 'src/components/Hero.astro', purpose: 'Hero section' },
            { path: 'src/components/Features.astro', purpose: 'Features section' },
            { path: 'src/components/Footer.astro', purpose: 'Footer' },
            { path: 'src/styles/global.css', purpose: 'Global styles' },
            { path: 'package.json', purpose: 'Dependencies' },
            { path: 'astro.config.mjs', purpose: 'Astro config' }
        ],
        advanced: [
            { path: 'src/pages/index.astro', purpose: 'Home page' },
            { path: 'src/pages/about.astro', purpose: 'About page' },
            { path: 'src/layouts/Layout.astro', purpose: 'Base layout' },
            { path: 'src/components/Header.astro', purpose: 'Header/nav' },
            { path: 'src/components/Hero.astro', purpose: 'Hero section' },
            { path: 'src/components/Features.astro', purpose: 'Features' },
            { path: 'src/components/Card.astro', purpose: 'Reusable card' },
            { path: 'src/components/Footer.astro', purpose: 'Footer' },
            { path: 'src/components/Interactive.jsx', purpose: 'Interactive island (React)' },
            { path: 'src/styles/global.css', purpose: 'Global styles' },
            { path: 'package.json', purpose: 'Dependencies' },
            { path: 'astro.config.mjs', purpose: 'Astro config' },
            { path: 'tsconfig.json', purpose: 'TypeScript config' }
        ]
    }
};

// ─── Add tailwind config file to structure if needed ────────────────────────
function addTailwindFiles(files, framework) {
    const hasTailwindConfig = files.some(f => f.path.includes('tailwind.config'));
    if (!hasTailwindConfig) {
        files.push({ path: 'tailwind.config.js', purpose: 'Tailwind CSS configuration' });
    }
    // For non-Next.js, ensure postcss config exists
    if (framework !== 'nextjs') {
        const hasPostcss = files.some(f => f.path.includes('postcss.config'));
        if (!hasPostcss) {
            files.push({ path: 'postcss.config.js', purpose: 'PostCSS configuration for Tailwind' });
        }
    }
    return files;
}

/**
 * Service for analyzing user prompts and generating project plans
 */
export class AnalysisService {
    constructor() {
        this.jsonSystemPrompt = 'You MUST output ONLY a valid JSON object. NO markdown code fences (NO \`\`\`json), NO conversational text, NO explanations. Output MUST start with { and end with }.';
    }

    /**
     * Helper for cleaning and parsing JSON responses (exported for testing)
     */
    static tryParseJson(str) {
        if (!str || typeof str !== 'string') return null;
        let s = str.trim();
        if (s.length === 0) return null;

        // Try to strip potential conversational prefix/suffix
        if (!s.startsWith('{') && !s.startsWith('[')) {
            const firstBrace = s.indexOf('{');
            const firstBracket = s.indexOf('[');
            const startIdx = firstBrace === -1 ? firstBracket : (firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket));
            if (startIdx !== -1) s = s.substring(startIdx);
        }

        if (!s.endsWith('}') && !s.endsWith(']')) {
            const lastBrace = s.lastIndexOf('}');
            const lastBracket = s.lastIndexOf(']');
            const endIdx = Math.max(lastBrace, lastBracket);
            if (endIdx !== -1) s = s.substring(0, endIdx + 1);
        }

        try {
            return JSON.parse(s);
        } catch (e) {
            // Fix common JSON errors: trailing commas, unquoted keys
            let fixed = s
                .replace(/,(\s*[}\]])/g, '$1') // trailing commas
                .replace(/(['"])?([a-zA-Z0-9_$]+)(['"])?\s*:/g, '"$2":') // unquoted keys (basic)
                .replace(/'/g, '"'); // single quotes to double quotes

            try {
                return JSON.parse(fixed);
            } catch (e2) {
                if (fixed.startsWith('{') && !fixed.endsWith('}')) {
                    const toClose = (fixed.match(/{/g) || []).length - (fixed.match(/}/g) || []).length;
                    if (toClose > 0) {
                        try { return JSON.parse(fixed + '}'.repeat(toClose)); } catch (e3) { /* noop */ }
                    }
                }
            }
        }
        return null;
    }

    /**
     * Helper for cleaning conversational artifacts (exported for testing)
     */
    static cleanResponse(response, prompt = '') {
        if (!response || typeof response !== 'string') return '';
        let cleaned = response.trim();

        // Strip if response echoes prompt
        if (prompt && cleaned.startsWith(prompt.trim())) {
            cleaned = cleaned.substring(prompt.trim().length).trim();
        }

        const systemEchoes = [
            'You are a code generator. Output ONLY code.',
            'Output ONLY valid JSON.',
            'You output only valid JSON.',
            'Here is the JSON',
            'Certainly!',
            'Here is the',
            'I can help you with that',
            'I have analyzed your request',
            '```json',
            '```'
        ];

        for (const phrase of systemEchoes) {
            const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            cleaned = cleaned.replace(re, '').trim();
        }

        return cleaned;
    }

    /**
     * Analyze user prompt and extract requirements
     */
    async analyzePrompt(userPrompt, options = {}) {
        // Check cache first
        const cached = getCachedAnalysis(userPrompt, options);
        if (cached) {
            logger.info('Analysis cache hit');
            return cached;
        }

        let prompt = ANALYZER_PROMPT.replace('{prompt}', String(userPrompt));

        // Add hints if user pre-selected framework/styling
        const frameworkHint = options.framework && options.framework !== 'auto'
            ? `\nUser has pre-selected framework: ${options.framework}. Use this framework.`
            : '';
        const stylingHint = options.styling && options.styling !== 'auto'
            ? `\nUser has pre-selected styling: ${options.styling}. Use this styling framework.`
            : '';

        prompt = prompt.replace('{frameworkHint}', frameworkHint).replace('{stylingHint}', stylingHint);

        const maxAnalyzeAttempts = 2;
        for (let attempt = 1; attempt <= maxAnalyzeAttempts; attempt++) {
            try {
                const response = await generateCompletion(prompt, {
                    maxTokens: 800,
                    temperature: 0.1,
                    systemPrompt: this.jsonSystemPrompt,
                    responseMimeType: 'application/json'
                });

                const result = this._extractJsonPayload(this._normalize(response), prompt);

                if (result && typeof result === 'object') {
                    const normalized = this._normalizeAnalysis(result, userPrompt, options);
                    setCachedAnalysis(userPrompt, options, normalized);
                    return normalized;
                }

                if (attempt < maxAnalyzeAttempts) {
                    const delayMs = attempt * 1000;
                    logger.warn(`Analyze attempt ${attempt}: no valid JSON, retrying in ${delayMs}ms`);
                    await new Promise(r => setTimeout(r, delayMs));
                } else {
                    logger.warn('Analyze: no valid JSON after retries, using fallback');
                    return this._getAnalysisFallback(userPrompt, options);
                }
            } catch (error) {
                if (attempt < maxAnalyzeAttempts) {
                    const delayMs = attempt * 1000;
                    logger.warn(`Analyze error (attempt ${attempt}): ${error.message}, retrying in ${delayMs}ms`);
                    await new Promise(r => setTimeout(r, delayMs));
                } else {
                    logger.warn(`Analyze error: ${error.message}, using fallback`);
                    return this._getAnalysisFallback(userPrompt, options);
                }
            }
        }

        return this._getAnalysisFallback(userPrompt, options);
    }

    /**
     * Generate project plan based on requirements
     */
    async generatePlan(requirements) {
        const cached = getCachedPlan(requirements);
        if (cached) {
            const complexity = requirements.complexity || 'simple';
            const [, maxFiles] = FILE_COUNT_BOUNDS[complexity] || FILE_COUNT_BOUNDS.intermediate;
            const n = cached.files?.length ?? 0;
            if (n > maxFiles) {
                logger.warn('Plan cache skipped — cached plan exceeds complexity file cap', { complexity, n, maxFiles });
            } else {
                logger.info('Plan cache hit');
                return cached;
            }
        }

        const framework = requirements.framework || config.defaultFramework;
        const projectType = requirements.projectType || 'web-app';
        const complexity = requirements.complexity || 'simple';
        const stylingFramework = requirements.stylingFramework || 'plain-css';

        const prompt = PLANNER_PROMPT
            .replace('{requirements}', JSON.stringify(requirements, null, 2))
            .replace('{projectType}', projectType)
            .replace('{framework}', framework)
            .replace('{stylingFramework}', stylingFramework)
            .replace('{complexity}', complexity);

        const planSystemPrompt = 'You MUST output ONLY a valid JSON object. NO markdown code fences (NO ```json), NO conversational text, NO explanations. Output MUST start with { and end with }.';

        const maxPlanAttempts = 2;
        for (let attempt = 1; attempt <= maxPlanAttempts; attempt++) {
            try {
                const response = await generateCompletion(prompt, {
                    maxTokens: 1500,
                    temperature: 0.1,
                    systemPrompt: planSystemPrompt,
                    responseMimeType: 'application/json'
                });

                const result = this._extractJsonPayload(this._normalize(response), prompt);
                const validFiles = Array.isArray(result?.files) && result.files.length > 0;

                if (result && typeof result === 'object' && validFiles) {
                    const normalized = this._normalizePlan(result, requirements);
                    setCachedPlan(requirements, normalized);
                    return normalized;
                }

                if (attempt < maxPlanAttempts) {
                    const delayMs = attempt * 1000;
                    logger.warn(`Plan attempt ${attempt}: no valid JSON, retrying in ${delayMs}ms`);
                    await new Promise(r => setTimeout(r, delayMs));
                } else {
                    logger.warn('Plan: no valid JSON from LLM after retries, using framework-specific fallback');
                    return this._getPlanFallback(requirements);
                }
            } catch (error) {
                if (attempt < maxPlanAttempts) {
                    const delayMs = attempt * 1000;
                    logger.warn(`Plan error (attempt ${attempt}): ${error.message}, retrying in ${delayMs}ms`);
                    await new Promise(r => setTimeout(r, delayMs));
                } else {
                    logger.warn(`Plan error: ${error.message}, using fallback`);
                    return this._getPlanFallback(requirements);
                }
            }
        }

        return this._getPlanFallback(requirements);
    }

    // ─── Private Methods ────────────────────────────────────────────────────

    _normalize(response) {
        if (response == null) return '';
        if (typeof response === 'string') return response;
        if (typeof response === 'object' && typeof response.text === 'string') return response.text;
        return String(response);
    }

    _extractJsonPayload(cleanedResponse, prompt) {
        if (!cleanedResponse) return null;

        let cleaned = AnalysisService.cleanResponse(cleanedResponse, prompt);
        const trimmed = cleaned.trim();

        // Try parse as-is
        if ((trimmed.startsWith('{') || trimmed.startsWith('[')) &&
            (trimmed.endsWith('}') || trimmed.endsWith(']'))) {
            const parsed = AnalysisService.tryParseJson(trimmed);
            if (parsed !== null) return parsed;
        }

        // Find first JSON character
        const firstBrace = cleaned.indexOf('{');
        const firstBracket = cleaned.indexOf('[');
        const firstJson = firstBrace === -1 ? firstBracket :
            (firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket));

        if (firstJson > 0) {
            cleaned = cleaned.slice(firstJson).trim();
        }

        // Try markdown code blocks
        const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (codeBlockMatch) {
            const parsed = AnalysisService.tryParseJson(codeBlockMatch[1]);
            if (parsed !== null) return parsed;
        }

        // Try full cleaned response
        let parsed = AnalysisService.tryParseJson(cleaned);
        if (parsed !== null) return parsed;

        // Try balanced JSON object extraction from first "{"
        const firstObject = cleaned.indexOf('{');
        if (firstObject !== -1) {
            let depth = 0;
            let inString = false;
            let escaped = false;
            for (let i = firstObject; i < cleaned.length; i++) {
                const ch = cleaned[i];
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (ch === '\\') {
                    escaped = true;
                    continue;
                }
                if (ch === '"') {
                    inString = !inString;
                    continue;
                }
                if (inString) continue;
                if (ch === '{') depth++;
                if (ch === '}') {
                    depth--;
                    if (depth === 0) {
                        const candidate = cleaned.slice(firstObject, i + 1);
                        parsed = AnalysisService.tryParseJson(candidate);
                        if (parsed !== null) return parsed;
                        break;
                    }
                }
            }
        }

        // Try from start to last }
        const lastBrace = cleaned.lastIndexOf('}');
        if (lastBrace > 0) {
            parsed = AnalysisService.tryParseJson(cleaned.slice(0, lastBrace + 1));
            if (parsed !== null) return parsed;
        }

        return null;
    }

    _cleanResponse(response, prompt) {
        return AnalysisService.cleanResponse(response, prompt);
    }

    _tryParseJson(str) {
        return AnalysisService.tryParseJson(str);
    }

    _inferProjectType(prompt) {
        const p = String(prompt).toLowerCase();
        if (p.includes('landing') || p.includes('marketing')) return 'landing-page';
        if (p.includes('dashboard') || p.includes('admin')) return 'dashboard';
        if (p.includes('portfolio')) return 'portfolio';
        if (p.includes('blog')) return 'blog';
        if (p.includes('ecommerce') || p.includes('shop') || p.includes('store')) return 'ecommerce';
        if (p.includes('documentation') || p.includes('docs')) return 'documentation';
        if (p.includes('saas') || p.includes('subscription')) return 'saas';
        if (p.includes('social') || p.includes('community') || p.includes('forum')) return 'social';
        if (p.includes('crm') || p.includes('customer')) return 'crm';
        if (p.includes('game') || p.includes('play')) return 'game';
        if (p.includes('admin') || p.includes('panel')) return 'admin-panel';
        return 'web-app';
    }

    _inferFramework(prompt) {
        const p = String(prompt).toLowerCase();
        if (p.includes('next.js') || p.includes('nextjs') || p.includes('next js')) return 'nextjs';
        if (p.includes('angular')) return 'angular';
        if (p.includes('vue') || p.includes('vuejs') || p.includes('vue.js')) return 'vue';
        if (p.includes('svelte') || p.includes('sveltekit')) return 'svelte';
        if (p.includes('astro')) return 'astro';
        if (p.includes('typescript') && p.includes('react')) return 'react-ts';
        if (p.includes('react')) return 'react';
        // Complex projects default to react
        const complexTypes = ['dashboard', 'saas', 'crm', 'admin', 'ecommerce'];
        if (complexTypes.some(t => p.includes(t))) return 'react';
        return config.defaultFramework;
    }

    _inferStylingFramework(prompt) {
        const p = String(prompt).toLowerCase();
        if (p.includes('tailwind')) return 'tailwind';
        if (p.includes('scss') || p.includes('sass')) return 'scss';
        if (p.includes('styled-component') || p.includes('styled component')) return 'styled-components';
        if (p.includes('css module')) return 'css-modules';
        return 'plain-css';
    }

    _coerceStylingFramework(framework, stylingFramework) {
        // Vanilla projects do not have a build step; force plain CSS to avoid broken @tailwind/@apply output.
        if (framework === config.defaultFramework) return 'plain-css';
        return stylingFramework;
    }

    _defaultDesignIntent(projectType) {
        if (projectType === 'landing-page') {
            return {
                styleDirection: 'premium-modern',
                targetAudience: 'general web audience',
                conversionGoal: 'signup',
                visualDensity: 'balanced',
                qualityBar: 'premium'
            };
        }
        return {
            styleDirection: 'modern',
            targetAudience: 'general users',
            conversionGoal: 'engagement',
            visualDensity: 'balanced',
            qualityBar: 'standard'
        };
    }

    _normalizeDesignIntent(designIntent, projectType) {
        const defaults = this._defaultDesignIntent(projectType);
        if (!designIntent || typeof designIntent !== 'object') {
            return defaults;
        }
        return {
            styleDirection: designIntent.styleDirection || defaults.styleDirection,
            targetAudience: designIntent.targetAudience || defaults.targetAudience,
            conversionGoal: designIntent.conversionGoal || defaults.conversionGoal,
            visualDensity: designIntent.visualDensity || defaults.visualDensity,
            qualityBar: designIntent.qualityBar || defaults.qualityBar
        };
    }

    _defaultDesignSystem(projectType) {
        const base = {
            primaryColor: '#4f46e5',
            colorPalette: {
                background: '#ffffff',
                surface: '#f8fafc',
                text: '#0f172a',
                mutedText: '#475569',
                accent: '#4f46e5'
            },
            fontFamily: 'Inter',
            typeScale: {
                display: 'clamp(2.25rem, 6vw, 4rem)',
                h1: 'clamp(1.875rem, 4vw, 3rem)',
                h2: 'clamp(1.5rem, 3vw, 2.25rem)',
                body: '1rem',
                small: '0.875rem'
            },
            spacingScale: ['4px', '8px', '12px', '16px', '24px', '32px', '48px', '64px'],
            radiusScale: { sm: '8px', md: '12px', lg: '20px' },
            shadowScale: {
                soft: '0 4px 16px rgba(15, 23, 42, 0.08)',
                medium: '0 12px 32px rgba(15, 23, 42, 0.14)'
            },
            motion: {
                durationFast: '160ms',
                durationNormal: '280ms',
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
            }
        };

        if (projectType === 'landing-page') {
            return {
                ...base,
                colorPalette: {
                    background: '#ffffff',
                    surface: '#f8fafc',
                    text: '#020617',
                    mutedText: '#334155',
                    accent: '#4f46e5'
                }
            };
        }

        return base;
    }

    _normalizeDesignSystem(designSystem, projectType) {
        const defaults = this._defaultDesignSystem(projectType);
        const ds = designSystem && typeof designSystem === 'object' ? designSystem : {};
        return {
            primaryColor: ds.primaryColor || defaults.primaryColor,
            colorPalette: {
                ...defaults.colorPalette,
                ...(ds.colorPalette || {})
            },
            fontFamily: ds.fontFamily || defaults.fontFamily,
            typeScale: {
                ...defaults.typeScale,
                ...(ds.typeScale || {})
            },
            spacingScale: Array.isArray(ds.spacingScale) && ds.spacingScale.length > 0
                ? ds.spacingScale
                : defaults.spacingScale,
            radiusScale: {
                ...defaults.radiusScale,
                ...(ds.radiusScale || {})
            },
            shadowScale: {
                ...defaults.shadowScale,
                ...(ds.shadowScale || {})
            },
            motion: {
                ...defaults.motion,
                ...(ds.motion || {})
            }
        };
    }

    _getAnalysisFallback(userPrompt, options = {}) {
        const projectType = this._inferProjectType(userPrompt);
        const framework = options.framework && options.framework !== 'auto'
            ? options.framework
            : this._inferFramework(userPrompt);
        const stylingFramework = options.styling && options.styling !== 'auto'
            ? options.styling
            : this._inferStylingFramework(userPrompt);
        const safeStylingFramework = this._coerceStylingFramework(framework, stylingFramework);

        return {
            projectType,
            features: ['responsive design', 'modern UI', 'interactive elements'],
            styling: 'modern',
            framework,
            stylingFramework: safeStylingFramework,
            complexity: 'simple',
            colorScheme: '',
            layout: '',
            description: `A ${projectType} built with ${framework}`,
            designIntent: this._defaultDesignIntent(projectType),
            isFallback: true,
            usedFallback: true,
            warning: 'Could not parse AI response; using default requirements.'
        };
    }

    _normalizeAnalysis(result, userPrompt, options = {}) {
        const projectType = result.projectType || this._inferProjectType(userPrompt);

        // Respect user's pre-selection
        let framework = options.framework && options.framework !== 'auto'
            ? options.framework
            : (result.framework || this._inferFramework(userPrompt));

        // Validate framework
        if (!FRAMEWORKS.includes(framework)) {
            framework = this._inferFramework(userPrompt);
        }

        let stylingFramework = options.styling && options.styling !== 'auto'
            ? options.styling
            : (result.stylingFramework || this._inferStylingFramework(userPrompt));

        if (!STYLING_OPTIONS.includes(stylingFramework)) {
            stylingFramework = 'plain-css';
        }
        stylingFramework = this._coerceStylingFramework(framework, stylingFramework);

        return {
            projectType,
            features: Array.isArray(result.features) && result.features.length > 0
                ? result.features
                : ['responsive design', 'modern UI', 'interactive elements'],
            styling: result.styling || 'modern',
            framework,
            stylingFramework,
            complexity: result.complexity || 'simple',
            colorScheme: result.colorScheme || '',
            layout: result.layout || '',
            description: result.description || `A ${projectType} built with ${framework}`,
            designIntent: this._normalizeDesignIntent(result.designIntent, projectType),
            isFallback: false,
            usedFallback: false
        };
    }

    _getPlanFallback(requirements) {
        const framework = requirements.framework || config.defaultFramework;
        const complexity = requirements.complexity || 'simple';
        const stylingFramework = this._coerceStylingFramework(framework, requirements.stylingFramework || 'plain-css');

        // Get framework-specific structure
        const structures = FRAMEWORK_FILE_STRUCTURES[framework] || FRAMEWORK_FILE_STRUCTURES[config.defaultFramework];
        let files = [...(structures[complexity] || structures['simple'] || FRAMEWORK_FILE_STRUCTURES[config.defaultFramework].simple)];

        // Add tailwind files if needed
        if (stylingFramework === 'tailwind') {
            files = addTailwindFiles(files, framework);
        }

        // Defensive: never return empty files
        if (files.length === 0) {
            files = [...FRAMEWORK_FILE_STRUCTURES[config.defaultFramework].simple];
        }

        // Build tech stack
        const techStack = this._buildTechStack(framework, stylingFramework);

        return {
            files,
            techStack,
            designSystem: this._defaultDesignSystem(requirements.projectType),
            isFallback: true,
            usedFallback: true,
            warning: 'Could not parse AI response; using default file list.'
        };
    }

    _normalizePlan(result, requirements) {
        const framework = requirements.framework || config.defaultFramework;
        const stylingFramework = this._coerceStylingFramework(framework, requirements.stylingFramework || 'plain-css');

        let files = result.files.map(f =>
            typeof f === 'string'
                ? { path: f, purpose: '' }
                : { path: f.path || f.name, purpose: f.purpose || '' }
        );

        // Ensure entry points exist based on framework
        files = this._ensureEntryPoints(files, framework);

        // Add tailwind files if needed
        if (stylingFramework === 'tailwind') {
            files = addTailwindFiles(files, framework);
        }

        // Ensure package.json for non-vanilla
        if (framework !== config.defaultFramework) {
            const hasPkg = files.some(f => f.path === 'package.json');
            if (!hasPkg) {
                files.push({ path: 'package.json', purpose: 'Dependencies and scripts' });
            }
        }

        return {
            files,
            techStack: result.techStack || this._buildTechStack(framework, stylingFramework),
            designSystem: this._normalizeDesignSystem(result.designSystem, requirements.projectType),
            isFallback: false,
            usedFallback: false
        };
    }

    _ensureEntryPoints(files, framework) {
        const entryChecks = {
            'vanilla-js': [{ check: 'index.html', file: { path: 'index.html', purpose: 'Main HTML page' } }],
            'react': [
                { check: 'index.html', file: { path: 'index.html', purpose: 'HTML entry point' } },
                { check: 'App.jsx', file: { path: 'src/App.jsx', purpose: 'Main App component' } }
            ],
            'react-ts': [
                { check: 'index.html', file: { path: 'index.html', purpose: 'HTML entry point' } },
                { check: 'App.tsx', file: { path: 'src/App.tsx', purpose: 'Main App component' } }
            ],
            'nextjs': [
                { check: 'layout.tsx', file: { path: 'app/layout.tsx', purpose: 'Root layout' } },
                { check: 'page.tsx', file: { path: 'app/page.tsx', purpose: 'Home page' } }
            ],
            'vue': [
                { check: 'index.html', file: { path: 'index.html', purpose: 'HTML entry point' } },
                { check: 'App.vue', file: { path: 'src/App.vue', purpose: 'Root App component' } }
            ],
            'svelte': [
                { check: 'App.svelte', file: { path: 'src/App.svelte', purpose: 'Root Svelte component' } }
            ],
            'angular': [
                { check: 'app.component.ts', file: { path: 'src/app/app.component.ts', purpose: 'Root component' } },
                { check: 'index.html', file: { path: 'src/index.html', purpose: 'HTML entry point' } }
            ],
            'astro': [
                { check: 'index.astro', file: { path: 'src/pages/index.astro', purpose: 'Home page' } }
            ]
        };

        const checks = entryChecks[framework] || entryChecks[config.defaultFramework];
        for (const { check, file } of checks) {
            const hasFile = files.some(f => (f.path || '').includes(check));
            if (!hasFile) {
                files.unshift(file);
            }
        }

        return files;
    }

    _buildTechStack(framework, stylingFramework) {
        const stack = [];

        switch (framework) {
            case 'vanilla-js':
                stack.push('HTML5', 'CSS3', 'JavaScript ES6+');
                break;
            case 'react':
                stack.push('React 18', 'JavaScript', 'Vite');
                break;
            case 'react-ts':
                stack.push('React 18', 'TypeScript', 'Vite');
                break;
            case 'nextjs':
                stack.push('Next.js 14', 'React 18', 'TypeScript');
                break;
            case 'vue':
                stack.push('Vue 3', 'Composition API', 'Vite');
                break;
            case 'svelte':
                stack.push('Svelte 4', 'Vite');
                break;
            case 'angular':
                stack.push('Angular 17', 'TypeScript', 'RxJS');
                break;
            case 'astro':
                stack.push('Astro 4', 'TypeScript');
                break;
        }

        switch (stylingFramework) {
            case 'tailwind': stack.push('Tailwind CSS'); break;
            case 'scss': stack.push('SCSS'); break;
            case 'styled-components': stack.push('Styled Components'); break;
            case 'css-modules': stack.push('CSS Modules'); break;
            default: stack.push('CSS3');
        }

        return stack;
    }
}
