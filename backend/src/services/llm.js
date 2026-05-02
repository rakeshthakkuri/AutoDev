import config from '../config.js';

// ─── Supported Frameworks (re-export from config as single source of truth) ───
export const FRAMEWORKS = config.frameworks;
export const STYLING_OPTIONS = config.stylingOptions;
export const COMPLEXITY_LEVELS = config.complexityLevels;

export const PROJECT_TYPES = [
    'landing-page', 'web-app', 'dashboard', 'portfolio', 'ecommerce',
    'blog', 'documentation', 'saas', 'social', 'admin-panel', 'crm', 'game'
];

const LANDING_QUALITY_RUBRIC = `
LANDING PAGE QUALITY BENCHMARK (apply when projectType is "landing-page"):
- Build a conversion-focused narrative, not a generic section stack.
- Include semantic sections with clear role and hierarchy: hero, social proof, value/features, process/how-it-works, testimonials/trust, CTA, and footer.
- Typography must follow a clear scale (display/h1/h2/body/small) with strong hierarchy.
- Spacing must follow a repeatable token rhythm; avoid random one-off spacing values.
- Use an accessible color system with strong text/background contrast.
- Include polished hover/focus states and subtle motion that respects reduced-motion preferences.
- Ensure mobile-first responsiveness with clean breakpoints and readable line lengths.
- Do not use lorem ipsum or generic placeholder labels.
`;

// ─── Analyzer Prompt ─────────────────────────────────────────────────────────
export const ANALYZER_PROMPT = `Analyze the user's web project request and provide a detailed technical specification.
CRITICAL OUTPUT RULES — non-negotiable:
- Output ONLY a single valid JSON object.
- The very first character MUST be { and the very last character MUST be }.
- NO markdown code fences (no \`\`\`json).
- NO conversational filler, headings, or explanations.
- NO text before or after the JSON object.
- All keys and string values double-quoted; no trailing commas; no comments.

User request: "{prompt}"
{frameworkHint}{stylingHint}

REQUIRED JSON STRUCTURE (use exactly these keys):
{
  "projectType": "e.g., landing-page, dashboard, etc.",
  "features": ["feature1", "feature2"],
  "styling": "e.g., modern, minimal, brutalist",
  "complexity": "simple" | "intermediate" | "advanced",
  "framework": "vanilla-js" | "react" | "react-ts" | "nextjs" | "vue" | "svelte" | "angular" | "astro",
  "stylingFramework": "tailwind" | "plain-css" | "css-modules" | "styled-components" | "scss",
  "colorScheme": "Description of colors",
  "layout": "Description of layout",
  "description": "Short summary",
  "designIntent": {
    "styleDirection": "e.g., premium-modern, editorial, minimal-tech",
    "targetAudience": "e.g., startup founders, developers, consumers",
    "conversionGoal": "e.g., signup, demo booking, purchase, contact",
    "visualDensity": "airy" | "balanced" | "dense",
    "qualityBar": "standard" | "premium"
  }
}

QUALITY DEFAULTS FOR SHORT OR VAGUE PROMPTS:
- If the prompt is brief (e.g., "give a landing page"), infer premium-modern quality.
- For landing-page, default designIntent.qualityBar to "premium" unless user asks for basic.
- Prefer persuasive, real-world section copy over placeholders.

${LANDING_QUALITY_RUBRIC}`;

// ─── Planner Prompt ──────────────────────────────────────────────────────────
export const PLANNER_PROMPT = `Plan the complete file structure for this web project.
CRITICAL: You MUST output ONLY a valid JSON object.
- NO markdown code fences.
- NO conversational filler.
- NO text before or after the JSON.

Requirements: {requirements}
Project type: {projectType}
Framework: {framework}
Styling: {stylingFramework}
Complexity: {complexity}

REQUIRED JSON STRUCTURE — every component file (.jsx/.tsx/.vue/.svelte) MUST include
"props", "owns_state", and "consumed_by" so the coder agent can enforce a consistent
prop-interface contract across files. Non-component files may omit these.

{
  "files": [
    {
      "path": "path/to/file.ext",
      "purpose": "What this file does",
      "exports": ["SymbolNamesExportedByThisFile"],
      "imports": ["src/path/to/another/local/file.tsx"],
      "props": [
        { "name": "tasks", "type": "Task[]", "required": true, "description": "list of tasks to render" },
        { "name": "onToggle", "type": "(id: string) => void", "required": true, "description": "called when a task is toggled" }
      ],
      "owns_state": false,
      "consumed_by": ["src/App.tsx"]
    }
  ],
  "techStack": ["List of technologies"],
  "designSystem": {
    "primaryColor": "hex code",
    "colorPalette": {
      "background": "hex",
      "surface": "hex",
      "text": "hex",
      "mutedText": "hex",
      "accent": "hex"
    },
    "fontFamily": "font name",
    "typeScale": {
      "display": "size",
      "h1": "size",
      "h2": "size",
      "body": "size",
      "small": "size"
    },
    "spacingScale": ["4px", "8px", "12px", "16px", "24px", "32px", "48px"],
    "radiusScale": {
      "sm": "value",
      "md": "value",
      "lg": "value"
    },
    "shadowScale": {
      "soft": "shadow",
      "medium": "shadow"
    },
    "motion": {
      "durationFast": "ms",
      "durationNormal": "ms",
      "easing": "css easing"
    }
  }
}

FRAMEWORK-SPECIFIC FILE STRUCTURES (MANDATORY — exact paths, NO subfolders, NO splitting):
- vanilla-js: EXACTLY these three files at the project root, no more, no less:
    1. "index.html"   — must link <link rel="stylesheet" href="styles.css"> and <script defer src="script.js"></script>
    2. "styles.css"   — ONE CSS file containing reset + tokens (:root) + all rules. Do NOT split into multiple CSS files.
    3. "script.js"    — ONE JS file containing all logic. Do NOT split into multiple JS files.
  Never use "css/" or "js/" subfolders. Never create variables.css, reset.css, app.js, dom.js, etc.
- react: index.html, src/App.jsx, src/main.jsx, src/index.css (index.html MUST have #root and link to main.jsx)
- react-ts: index.html, src/App.tsx, src/main.tsx, src/index.css (index.html MUST have #root and link to main.tsx)
- nextjs: app/layout.tsx, app/page.tsx, app/globals.css
- vue: index.html, src/App.vue, src/main.js, src/style.css
- svelte: src/App.svelte, src/main.js, src/app.css
- angular: src/app/app.component.ts, src/app/app.component.html, src/app/app.component.css, src/main.ts, src/index.html, src/styles.css
- astro: src/pages/index.astro, src/layouts/Layout.astro, src/styles/global.css

RULES:
- Include all necessary config files (package.json, tailwind.config.js, tsconfig.json) for the chosen framework.
- Ensure all files have a clear purpose.
- For landing-page projects, include a structure that supports sectioned storytelling and conversion.
- Ensure designSystem values are token-ready (color, type, spacing, radius, shadow, motion), not only a single brand color.

PROP-INTERFACE CONTRACT (CRITICAL — prevents broken-UI bugs):
- For component files, "props" MUST be an array of typed prop descriptors:
    [{ "name": string, "type": string, "required": boolean, "description": string }]
  Use [] for stateless components with no inputs.
- "owns_state" MUST be set on every component file:
    true  → this component manages its own React state (typically App / page root only).
    false → this component receives data via props; it MUST NOT introduce useState/useReducer
            for data passed as props.
- For each parent–child pair, the parent's JSX call site MUST pass exactly the props the child declares.
  If parent renders <TaskList tasks={t} onToggle={fn} onDelete={fn}/>, the child's "props" array
  MUST list tasks, onToggle, onDelete with matching types — NOT some other names like "onTasksChange".

LOCKFILES / BUILD ARTIFACTS — never plan these:
- package-lock.json, yarn.lock, pnpm-lock.yaml — package managers create these
- node_modules/, dist/, build/, .next/, .vscode/, .idea/, .github/

Output ONLY the JSON object.`;

// ─── Framework-Specific Code Generator Prompts ──────────────────────────────
const FRAMEWORK_PROMPTS = {
    'vanilla-js': `Generate complete, production-ready code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

MANDATORY OUTPUT FORMAT:
- Output ONLY the raw code. 
- NO markdown code fences (e.g., NO \`\`\`html).
- NO explanations or conversational text.
- NO backticks around URLs (e.g., use "https://..." NOT \`https://...\`).
- NO backticks around attribute values.

CORE RULES:
- For index.html: 
    - Complete <!DOCTYPE html> structure.
    - MUST include <link rel="stylesheet" href="styles.css"> in <head>.
    - MUST include <script src="script.js" defer></script> before </body>.
    - Use semantic HTML5 (header, nav, main, section, footer).
    - Include high-quality Unsplash images (https://images.unsplash.com/...).
- For styles.css: Modern responsive design, mobile-first, using CSS variables.
- For script.js: Clean ES6+, modular functions, DOMContentLoaded.
- Accessibility: Use proper ARIA labels and semantic structure.`,

    'react': `Generate complete, production-ready React (JSX) code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

MANDATORY OUTPUT FORMAT:
- Output ONLY the raw code.
- NO markdown code fences.
- NO explanations or conversational text.
- NO backticks around URLs or imports.

CORE RULES:
- Use functional components with hooks (useState, useEffect, useCallback, useMemo).
- Use proper JSX syntax: className, htmlFor, onClick, onChange.
- Export components as default exports.
- Icons: Use inline SVGs or 'lucide-react' components if suitable.
- Images: Use relevant, high-quality Unsplash URLs.
- Accessibility: Use semantic HTML and aria-labels.
- For App.jsx: Import child components using relative paths (e.g., './components/Header').
- Make it visually polished with real content - avoid "Lorem Ipsum".
- Handle state properly; avoid prop drilling for complex apps.`,

    'react-ts': `Generate complete, production-ready React TypeScript code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

MANDATORY OUTPUT FORMAT:
- Output ONLY the raw code.
- NO markdown code fences.
- NO explanations.
- NO backticks around URLs or imports.

CORE RULES:
- Use TypeScript with strict type annotations and interfaces.
- Use functional components with typed props: interface Props { ... } and React.FC<Props>.
- Use proper hooks typing: useState<Type>, useRef<HTMLElement>.
- Icons/Images: Use high-quality assets (SVGs, Unsplash).
- Export components as default exports.
- Use ONLY relative import paths (e.g., './components/Header') — NEVER use @/ path aliases.
- For tsconfig.json: Include strict mode, jsx: react-jsx.
- Make it visually polished with real content.`,

    'nextjs': `Generate complete, production-ready Next.js 14+ (App Router) code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

MANDATORY OUTPUT FORMAT:
- Output ONLY the raw code.
- NO markdown code fences.
- NO explanations.
- NO backticks around URLs or imports.

CORE RULES:
- Use the App Router (app/ directory), NOT pages/ router.
- Add 'use client' at the top of EVERY component file that uses hooks, state, or event handlers.
- NEVER export metadata objects — do NOT write "export const metadata" anywhere.
- NEVER use async function components — all components must be regular synchronous functions.
- NEVER use the Next.js Image component (<Image />) — use plain <img> tags instead.
- NEVER use server-only imports: next/headers, next/cache, server-only, next/server.
- Use ONLY relative import paths (e.g., './components/Header') — NEVER use @/ path aliases.
- For API routes: Use app/api/route.ts with named exports (GET, POST).
- Use TypeScript throughout with proper interfaces.
- For tailwind: Use utility classes extensively.
- Make it visually polished with real, high-quality content.`,

    'vue': `Generate complete, production-ready Vue 3 code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

MANDATORY OUTPUT FORMAT:
- Output ONLY the raw code.
- NO markdown code fences.
- NO explanations.
- NO backticks around URLs or imports.

CORE RULES:
- Use Vue 3 Composition API with <script setup> syntax.
- .vue files MUST have <template>, <script setup>, and <style scoped> sections.
- Use ref(), reactive(), computed(), watch() from 'vue'.
- Use defineProps(), defineEmits() for component communication.
- For main.js: Import createApp from 'vue', import App.vue, mount to #app.
- Accessibility: Use semantic HTML and aria-labels.
- Make it visually polished with real content.`,

    'svelte': `Generate complete, production-ready Svelte code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

MANDATORY OUTPUT FORMAT:
- Output ONLY the raw code.
- NO markdown code fences.
- NO explanations.
- NO backticks around URLs or imports.

CORE RULES:
- .svelte files have <script>, <style>, and HTML template sections.
- Use Svelte reactivity: $: reactive statements, bind:value, on:click.
- Use {#if}, {#each}, {#await} template blocks.
- Use writable/readable stores from 'svelte/store' for shared state.
- Export props with: export let propName.
- Make it visually polished with real content.`,

    'angular': `Generate complete, production-ready Angular code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

MANDATORY OUTPUT FORMAT:
- Output ONLY the raw code.
- NO markdown code fences.
- NO explanations.
- NO backticks around URLs or imports.

CORE RULES:
- Use Angular 17+ with standalone components.
- Components use @Component decorator with standalone: true, imports array.
- Use signals for state management: signal(), computed(), effect().
- Use TypeScript with proper decorators and typing.
- For templates (.html): Use modern Angular control flow (@if, @for).
- Make it visually polished with real content.`,

    'astro': `Generate complete, production-ready Astro code for: {file_path}
Project type: {projectType} | Style: {styling} | User wants: {userPrompt}

MANDATORY OUTPUT FORMAT:
- Output ONLY the raw code.
- NO markdown code fences.
- NO explanations.
- NO backticks around URLs or imports.

CORE RULES:
- .astro files have a frontmatter section (---) and HTML template.
- Use Astro components for static content, islands for interactivity (client:load).
- Layouts wrap pages with <slot /> for content injection.
- Use <style> tags with scoped styles by default.
- Make it visually polished with real content.`
};

// ─── Styling-Specific Instructions ──────────────────────────────────────────
const STYLING_INSTRUCTIONS = {
    'tailwind': `
TAILWIND CSS INSTRUCTIONS:
- Output ONLY the raw code. No markdown fences.
- Use Tailwind utility classes extensively (flex, grid, p-4, text-lg, bg-blue-500, etc.).
- Use responsive prefixes: sm:, md:, lg:, xl:.
- Use state variants: hover:, focus:, active:, dark:.
- For layout: Use flex/grid utilities; avoid absolute positioning unless necessary.
- In CSS files: Use @tailwind base; @tailwind components; @tailwind utilities;.
- For animations: Use animate-fade, animate-pulse or custom Tailwind animations.
- Design: Ensure good contrast, consistent spacing scale, and modern aesthetics.
- Use a coherent type scale (display/h1/h2/body/small) and spacing rhythm across sections.
- CTA buttons must include visible hover and focus-visible states.
- For landing-page output, build section cadence and conversion-focused content blocks.`,

    'plain-css': `
CSS INSTRUCTIONS:
- Output ONLY the raw code. No markdown fences.
- Use CSS custom properties (variables) for theming (--primary, --bg, etc.).
- CRITICAL: Define ALL --xxx custom properties in :root AT THE TOP of THIS file before they are used. Every var(--foo) MUST have a matching --foo: value; in :root within the same file. Missing definitions cause the page to render completely unstyled.
- Use CSS Grid and Flexbox for modern, responsive layouts.
- Mobile-first approach with media queries.
- Smooth transitions: transition: all 0.3s ease-in-out;
- Include a CSS reset (box-sizing: border-box; margin: 0; padding: 0;).
- Define design tokens for color, typography, spacing, radius, shadow, and motion in :root — all in this single file.
- Use token values consistently; avoid arbitrary one-off values unless justified.
- Include :focus-visible states for interactive elements.
- For landing-page output, enforce section rhythm and strong visual hierarchy.
- For vanilla-js projects: keep ALL styles in one styles.css. Do NOT split into variables.css, reset.css, etc.`,

    'css-modules': `
CSS MODULES INSTRUCTIONS:
- Name files as *.module.css.
- Import as: import styles from './Component.module.css'.
- Apply as: className={styles.container}.
- Keep styles encapsulated and modular.`,

    'styled-components': `
STYLED-COMPONENTS INSTRUCTIONS:
- Create reusable styled components: const Container = styled.div\`...\`.
- Use props for dynamic styling: ${'{'}props => props.active ? '...' : '...'{'}'}.
- Implement a theme using ThemeProvider.`,

    'scss': `
SCSS INSTRUCTIONS:
- Use .scss extension with variables, nesting, and mixins.
- Use @use and @forward for modern SCSS modularity.
- Structure with partials (_variables.scss, _mixins.scss).`
};

// ─── Context Prompt for Inter-File Coherence ────────────────────────────────
function extractExportsAndSignatures(content, filePath) {
    if (content.length <= 500) return content;
    const lines = content.split('\n');
    const out = [];
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    // Include important imports (first few lines)
    const importLines = content.match(/^import\s+.*$/gm);
    if (importLines) {
        const relevantImports = importLines.filter(imp => 
            !imp.includes('react') && 
            !imp.includes('vue') && 
            !imp.includes('svelte') &&
            !imp.includes('lucide-react')
        ).slice(0, 5);
        if (relevantImports.length > 0) out.push(relevantImports.join('\n'));
    }

    if (['jsx', 'tsx', 'vue', 'svelte', 'js', 'ts'].includes(ext)) {
        // 1. Default export identification
        const defaultExport = content.match(/export\s+default\s+(?:function\s+)?(\w+)|export\s+default\s+(\w+)/);
        if (defaultExport) out.push(`// Default Export: ${defaultExport[1] || defaultExport[2]}`);

        // 2. Component Props / Interface Extraction
        // Look for interfaces/types ending in Props or just 'Props'
        const propsInterfaceMatch = content.match(/(?:interface|type)\s+\w*Props\w*\s*=\s*\{[^}]*\}|(?:interface|type)\s+\w*Props\w*\s*\{[^}]*\}/g);
        if (propsInterfaceMatch) {
            out.push('// Props Definition:\n' + propsInterfaceMatch.slice(0, 1).join('\n'));
        }

        // 3. Named Exports (signatures only)
        const namedExportLines = lines.filter(line => 
            line.trim().startsWith('export const') || 
            line.trim().startsWith('export function') || 
            line.trim().startsWith('export interface') || 
            line.trim().startsWith('export type') ||
            line.trim().startsWith('export class')
        );
        if (namedExportLines.length > 0) {
            const signatures = namedExportLines.slice(0, 5).map(l => {
                const trimmed = l.trim();
                // If it's a function, try to get the signature
                if (trimmed.includes('function') || trimmed.includes('=>')) {
                    const match = trimmed.match(/(?:export\s+)?(?:const|function)\s+(\w+)\s*(?:=\s*)?(\([^)]*\))/);
                    if (match) return `export ${match[1]}${match[2]}`;
                }
                return trimmed;
            });
            out.push('// Named Exports:\n' + signatures.join('\n'));
        }

        // 4. Function/Component Signatures from destructured props
        if (content.includes('({')) {
            const componentSig = content.match(/(?:const|function)\s+([A-Z]\w+)\s*=\s*\(\{([^})]*)\}\)/);
            if (componentSig) {
                out.push(`// Component: ${componentSig[1]} (Props: ${componentSig[2].trim()})`);
            }
        }
    } else if (['css', 'scss'].includes(ext)) {
        // CSS variables
        const variables = content.match(/--[\w-]+\s*:\s*[^;]+;/g);
        if (variables) out.push('// Theme Variables:\n' + variables.slice(0, 15).join('\n'));
        
        // Key selectors for layout/theme
        const selectors = content.match(/^[:.][\w-]+\s*\{/gm);
        if (selectors) {
            out.push('// Selectors: ' + selectors.slice(0, 10).map(s => s.replace('{', '').trim()).join(', '));
        }
    } else if (filePath.endsWith('package.json')) {
        try {
            const pkg = JSON.parse(content);
            const deps = { ...pkg.dependencies };
            const scripts = pkg.scripts ? Object.keys(pkg.scripts) : [];
            out.push(`// Dependencies: ${Object.keys(deps).join(', ')}`);
            if (scripts.length > 0) out.push(`// Scripts: ${scripts.join(', ')}`);
        } catch (e) {
            out.push('// package.json (invalid JSON)');
        }
    }

    if (out.length === 0) return content.substring(0, 500) + '\n// ...';
    return out.join('\n\n') + '\n// ... (context excerpt)';
}

export const buildContextPrompt = (generatedFiles, currentFilePath) => {
    if (!generatedFiles || Object.keys(generatedFiles).length === 0) return '';

    // Prioritize files:
    // 1. Critical config (package.json, tailwind.config.js, etc.)
    // 2. Global styles (index.css, globals.css)
    // 3. Files in the same directory as currentFilePath
    // 4. Everything else
    
    const entries = Object.entries(generatedFiles);
    const currentDir = currentFilePath ? currentFilePath.split('/').slice(0, -1).join('/') : null;
    const isCritical = (p) => p.includes('package.json') || p.includes('config.') || p.includes('tsconfig');
    const isStyle = (p) => p.endsWith('.css') || p.endsWith('.scss');
    const sameDir = (p) => currentDir !== null && p.split('/').slice(0, -1).join('/') === currentDir;

    const sortedEntries = entries.sort(([pathA], [pathB]) => {
        if (isCritical(pathA) && !isCritical(pathB)) return -1;
        if (!isCritical(pathA) && isCritical(pathB)) return 1;
        if (isStyle(pathA) && !isStyle(pathB)) return -1;
        if (!isStyle(pathA) && isStyle(pathB)) return 1;
        if (sameDir(pathA) && !sameDir(pathB)) return -1;
        if (!sameDir(pathA) && sameDir(pathB)) return 1;
        return 0;
    });

    // Limit context to top 10 most relevant files to save tokens
    const limitedEntries = sortedEntries.slice(0, 10);

    const fileList = limitedEntries
        .map(([p, content]) => {
            const excerpt = extractExportsAndSignatures(content, p);
            return `--- ${p} ---\n${excerpt}`;
        })
        .join('\n\n');

    return `\nPREVIOUSLY GENERATED FILES (reference these for consistency - match imports, export names, component names, props):\n${fileList}\n`;
};

const EXPORT_IMPORT_RULES = `
GLOBAL CODE QUALITY RULES:
- Output ONLY the raw code.
- NO markdown code fences (NO \`\`\`js, NO \`\`\`html).
- NO conversational filler.
- NO backticks (\`) around URLs or attribute values.
- Every component file MUST have a default export. 
- Import paths must match exactly: if you import from './components/Header', the file must exist at that path.
- Do NOT use placeholder content like "Lorem ipsum" or "TODO" — generate real, relevant content.`;

const PROJECT_TYPE_QUALITY_RULES = {
    'landing-page': `
${LANDING_QUALITY_RUBRIC}
LANDING STRUCTURE RULES:
- Ensure a clear conversion funnel from hero to CTA.
- Use semantic landmarks and section ids for navigation.
- Include social proof/trust elements (stats, testimonials, logos, or proof points).
- Include at least one strong CTA block with clear action copy.
`
};

// ─── Build the Full Code Generation Prompt ──────────────────────────────────
export const buildCodeGenPrompt = ({ filePath, framework, projectType, styling, stylingFramework, userPrompt, generatedFiles, planFiles = [] }) => {
    const basePrompt = FRAMEWORK_PROMPTS[framework] || FRAMEWORK_PROMPTS[config.defaultFramework];
    const stylingInst = STYLING_INSTRUCTIONS[stylingFramework] || STYLING_INSTRUCTIONS['plain-css'];
    const context = buildContextPrompt(generatedFiles, filePath);

    let prompt = basePrompt
        .replace(/{file_path}/g, filePath)
        .replace(/{projectType}/g, projectType || 'web-app')
        .replace(/{styling}/g, styling || 'modern')
        .replace(/{userPrompt}/g, userPrompt);

    prompt += EXPORT_IMPORT_RULES;
    prompt += stylingInst;
    prompt += PROJECT_TYPE_QUALITY_RULES[projectType] || '';
    prompt += context;

    const otherPlannedPaths = (planFiles || []).filter(f => (f.path || f) !== filePath).map(f => (typeof f === 'string' ? f : f.path));
    const alreadyGeneratedPaths = Object.keys(generatedFiles || {}).filter(p => p !== filePath);
    if (otherPlannedPaths.length > 0 || alreadyGeneratedPaths.length > 0) {
        prompt += `\nFILE CONTRACT:\n`;
        if (otherPlannedPaths.length > 0) {
            prompt += `FILES THAT MAY IMPORT FROM THIS FILE: ${otherPlannedPaths.slice(0, 10).join(', ')}\n`;
        }
        if (alreadyGeneratedPaths.length > 0) {
            prompt += `THIS FILE SHOULD IMPORT FROM (if needed): ${alreadyGeneratedPaths.slice(0, 12).join(', ')}\n`;
        }
    }

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

// MIGRATION SHIM: implementations live in src/services/llm/ (single pinned provider).
export {
    generateCompletion,
    generateCompletionStream,
    generateFix,
    initializeModel,
    runWithRetryHooks,
    getActiveProvider,
    llmDispatcher,
    LLMError,
    TransientLLMError,
    HardLLMError,
    ContentLLMError,
} from './llm/index.js';
