import logger from '../../services/logger.js';
import { ContextBuilder, calculateTokenBudget } from './context.js';
import { createError } from '../shared/errors.js';
import { CODEGEN_PROMPT_V2 } from './prompts.js';
import config from '../../config.js';

/**
 * Coder Agent — generates individual files with dependency-aware context.
 * Wraps the existing _generateSingleFile with ProjectMemory integration.
 */
export class CoderAgent {
    /**
     * @param {{ generationService: import('../../services/projectGeneration.js').ProjectGenerationService }} services
     */
    constructor(services) {
        this.generationService = services.generationService;
        this.useV2 = config.agentVersion === 'v2';
    }

    /**
     * Generate the next file in the queue.
     * Called by the orchestrator graph's generate_next_file node.
     *
     * @param {object} state - Orchestrator state
     * @returns {object} State delta
     */
    async generateNext(state) {
        const { fileQueue, currentFileIndex = 0, memory, requirements, plan, userPrompt, projectDir, emitter } = state;

        if (!fileQueue || currentFileIndex >= fileQueue.length) {
            return { currentFileIndex };
        }

        const fileInfo = fileQueue[currentFileIndex];
        const filePath = typeof fileInfo === 'string' ? fileInfo : fileInfo.path;

        logger.info(`[CoderAgent] Generating file ${currentFileIndex + 1}/${fileQueue.length}: ${filePath}`);

        // Mark as generating in memory
        if (memory) {
            memory.setFileGenerating(filePath);
            memory.addDecision('coder', 'generate_file', `Starting generation of ${filePath}`);
        }

        // Build context using the new dependency-aware builder
        const contextBuilder = memory ? new ContextBuilder(memory) : null;
        const tokenBudget = calculateTokenBudget(filePath, requirements?.complexity, memory);

        const generatedFiles = memory ? memory.getGeneratedFiles() : (state.generatedFiles || {});

        // Build v2 prompt override if enabled
        let promptOverride = null;
        if (this.useV2) {
            promptOverride = this.buildPromptV2({
                filePath,
                fileInfo,
                requirements,
                plan,
                userPrompt,
                memory,
                contextBuilder,
                tokenBudget,
                generatedFiles,
            });
            logger.info(`[CoderAgent] Using v2 prompt for ${filePath} (budget: ${tokenBudget})`);
        }

        try {
            await this.generationService._generateSingleFile({
                fileInfo,
                userPrompt,
                requirements,
                plan,
                projectDir,
                generatedFiles,
                totalFiles: fileQueue.length,
                filesCompleted: currentFileIndex,
                onProgress: (msg, pct) => emitter?.emitProgress(msg, pct),
                onFileGenerated: (data) => {
                    // Update memory when file is generated
                    if (memory) {
                        memory.setFileGenerated(data.path, data.content, data.validation);
                    }
                    emitter?.emitFileGenerated(data);
                },
                onFileChunk: (data) => emitter?.emitFileChunk(data.path, data.chunk),
                onError: (data) => {
                    if (memory) {
                        memory.setFileFailed(data.path, data.error || data.message);
                        memory.addError(createError('SYNTAX_ERROR', {
                            phase: 'generation',
                            agent: 'coder',
                            file: data.path,
                            message: data.error || data.message,
                        }));
                    }
                    emitter?.emitFileError(data);
                },
                onFileFixing: (data) => emitter?.emitFileFixing(data),
                onFileFixed: (data) => {
                    if (memory) {
                        memory.setFileFixed(data.path, data.content, data.validation);
                    }
                    emitter?.emitFileFixed(data);
                },
                // Pass contextBuilder for enhanced context (if the generation service supports it)
                _contextBuilder: contextBuilder,
                _tokenBudget: tokenBudget,
                // V2 prompt override — when set, _generateFile skips buildCodeGenPrompt
                _promptOverride: promptOverride,
            });

            const progress = fileQueue.length > 0
                ? Math.min(90, Math.floor(((currentFileIndex + 1) / fileQueue.length) * 85))
                : 0;
            emitter?.emitProgress(`Generated ${filePath}`, progress);

            return {
                currentFileIndex: currentFileIndex + 1,
            };
        } catch (err) {
            logger.error(`[CoderAgent] Failed to generate ${filePath}: ${err.message}`);
            if (memory) {
                memory.setFileFailed(filePath, err.message);
                memory.addError(createError('SYNTAX_ERROR', {
                    phase: 'generation',
                    agent: 'coder',
                    file: filePath,
                    message: err.message,
                }));
            }

            // Don't throw — continue to next file
            return {
                currentFileIndex: currentFileIndex + 1,
            };
        }
    }

    // ─── V2 Prompt Builder ──────────────────────────────────────────────────

    /**
     * Build CODEGEN_PROMPT_V2 with all placeholders filled in.
     * Only called when process.env.AGENT_VERSION === 'v2'.
     */
    buildPromptV2({ filePath, fileInfo, requirements, plan, userPrompt, memory, contextBuilder, tokenBudget, generatedFiles }) {
        const framework = requirements?.framework || 'react';
        const projectType = requirements?.projectType || 'web-app';
        const stylingFramework = requirements?.stylingFramework || 'plain-css';

        // --- Extract contract expectations from fileInfo or plan ---
        const purpose = typeof fileInfo === 'object' ? (fileInfo.purpose || '') : '';
        const fileContracts = memory?.getFile(filePath)?.contracts || {};
        const defaultExport = fileContracts.defaultExport
            || this._inferDefaultExport(filePath, framework)
            || 'The main component or value of this file';
        const namedExports = (fileContracts.namedExports || []).join(', ') || 'none required';
        const imports = (fileContracts.imports || []).join(', ') || 'infer from context';
        const props = fileContracts.props || 'infer from component purpose';

        // --- Build context section ---
        let context = '';
        if (contextBuilder) {
            context = contextBuilder.buildContext(filePath, Math.round(tokenBudget * 0.4));
        } else if (generatedFiles && Object.keys(generatedFiles).length > 0) {
            // Fallback: list generated file paths + brief signatures
            const entries = Object.entries(generatedFiles).slice(0, 10);
            context = entries.map(([p, content]) => {
                const preview = (content || '').substring(0, 300).split('\n').slice(0, 8).join('\n');
                return `--- ${p} ---\n${preview}\n// ...`;
            }).join('\n\n');
        }
        if (!context) context = 'No other files generated yet. This may be the first file.';

        // --- Build design system section ---
        let designSystem = '';
        if (memory?.designSystem) {
            designSystem = JSON.stringify(memory.designSystem, null, 2);
        } else if (plan?.designSystem) {
            designSystem = JSON.stringify(plan.designSystem, null, 2);
        }
        if (!designSystem) designSystem = 'No design system tokens available. Use sensible defaults.';

        // --- Framework rules ---
        const frameworkRules = FRAMEWORK_RULES_V2[framework] || FRAMEWORK_RULES_V2['react'];

        // --- Styling rules ---
        const stylingRules = STYLING_RULES_V2[stylingFramework] || STYLING_RULES_V2['plain-css'];

        // --- Fill template ---
        const prompt = CODEGEN_PROMPT_V2
            .replace(/{filePath}/g, filePath)
            .replace(/{projectType}/g, projectType)
            .replace(/{framework}/g, framework)
            .replace(/{stylingFramework}/g, stylingFramework)
            .replace(/{userPrompt}/g, userPrompt || purpose || 'Build this file as described')
            .replace(/{defaultExport}/g, defaultExport)
            .replace(/{namedExports}/g, namedExports)
            .replace(/{imports}/g, imports)
            .replace(/{props}/g, props)
            .replace(/{tokenBudget}/g, String(tokenBudget))
            .replace(/{frameworkRules}/g, frameworkRules)
            .replace(/{stylingRules}/g, stylingRules)
            .replace(/{context}/g, context)
            .replace(/{designSystem}/g, designSystem);

        return prompt;
    }

    /**
     * Infer a sensible default export name from the file path.
     */
    _inferDefaultExport(filePath, framework) {
        const basename = filePath.split('/').pop()?.replace(/\.\w+$/, '') || '';
        // Config/style/entry files don't need a component default export
        if (/\.(css|scss|json)$/.test(filePath)) return null;
        if (/^(main|index|entry)\.\w+$/.test(filePath.split('/').pop())) return null;
        if (filePath.includes('config')) return null;

        // PascalCase the basename for component files
        const pascal = basename
            .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
            .replace(/^(.)/, (_, c) => c.toUpperCase());
        return `${pascal} (as a ${framework.includes('react') ? 'React functional component' : 'component function'})`;
    }
}

// ─── V2 Framework-Specific Rules ────────────────────────────────────────────
// Compact rule sets injected into the <framework_rules> XML tag.

const FRAMEWORK_RULES_V2 = {
    'vanilla-js': `
- For index.html: complete <!DOCTYPE html>, link styles.css in <head>, script.js with defer before </body>.
- Use semantic HTML5 elements (header, nav, main, section, article, footer).
- For styles.css: mobile-first, CSS custom properties for theming, CSS Grid/Flexbox.
- For script.js: ES6+ modules, DOMContentLoaded, no global pollution.
- Use high-quality Unsplash images (https://images.unsplash.com/...).`,

    'react': `
- Functional components with hooks (useState, useEffect, useCallback, useMemo).
- JSX syntax: className (not class), htmlFor (not for), onClick, onChange.
- Every component file MUST export default a function component.
- Import children with relative paths (e.g., './components/Header').
- Use inline SVGs or lucide-react for icons.
- Use high-quality Unsplash URLs for images.
- Handle loading/error/empty states where applicable.`,

    'react-ts': `
- TypeScript with strict type annotations — define interfaces for all props.
- Use React.FC<Props> or typed function signatures.
- Typed hooks: useState<Type>, useRef<HTMLElement | null>.
- Every component file MUST export default a typed function component.
- Use ONLY relative import paths (e.g., './components/Header') — NEVER use @/ path aliases.
- For tsconfig.json: strict mode, jsx: "react-jsx".`,

    'nextjs': `
- App Router (app/ directory), NOT pages/ router.
- Add 'use client' at the top of EVERY component file that uses hooks, state, or event handlers.
- NEVER export metadata objects — do NOT write "export const metadata" anywhere.
- NEVER use async function components — all components must be regular synchronous functions.
- NEVER use the Next.js Image component (<Image />) — use plain <img> tags instead.
- NEVER use server-only imports: next/headers, next/cache, server-only, next/server.
- Use ONLY relative import paths (e.g., './components/Header') — NEVER use @/ path aliases.
- API routes: app/api/route.ts with named exports (GET, POST).
- TypeScript throughout with proper interfaces.`,

    'vue': `
- Vue 3 Composition API with <script setup> syntax.
- Every .vue file: <template>, <script setup>, <style scoped>.
- Use ref(), reactive(), computed(), watch() from 'vue'.
- Use defineProps(), defineEmits() for component communication.
- main.js: import createApp from 'vue', import App.vue, mount to #app.`,

    'svelte': `
- .svelte files: <script>, HTML template, <style> sections.
- Svelte reactivity: $: reactive statements, bind:value, on:click.
- Template blocks: {#if}, {#each}, {#await}.
- Stores: writable/readable from 'svelte/store' for shared state.
- Props: export let propName.`,

    'angular': `
- Angular 17+ standalone components with @Component decorator (standalone: true).
- Signals for state: signal(), computed(), effect().
- Modern control flow in templates: @if, @for, @switch.
- TypeScript with proper decorators and strict typing.`,

    'astro': `
- .astro files: frontmatter section (---) and HTML template.
- Use Astro components for static content, islands (client:load) for interactivity.
- Layouts use <slot /> for content injection.
- Scoped <style> tags by default.`,
};

// ─── V2 Styling-Specific Rules ──────────────────────────────────────────────

const STYLING_RULES_V2 = {
    'tailwind': `
- Use Tailwind utility classes exclusively — no inline styles or custom CSS unless absolutely necessary.
- Responsive prefixes: sm:, md:, lg:, xl:.
- State variants: hover:, focus:, focus-visible:, active:, dark:.
- Layout: flex/grid utilities; avoid absolute positioning unless needed.
- In CSS entry files: @tailwind base; @tailwind components; @tailwind utilities;.
- Use a coherent type scale and spacing rhythm — don't mix arbitrary values.
- All interactive elements need hover + focus-visible states.
- Reference design system colors via Tailwind config, not hardcoded hex.`,

    'plain-css': `
- Define design tokens as CSS custom properties in :root (colors, spacing, radii, shadows, motion).
- Use token values consistently — no arbitrary one-off values.
- CSS Grid + Flexbox for layout; mobile-first with min-width media queries.
- Include a minimal reset (box-sizing: border-box, margin: 0, padding: 0).
- Transitions: use design system motion tokens (e.g., var(--duration-normal)).
- Include :focus-visible styles for all interactive elements.`,

    'css-modules': `
- File names MUST use .module.css suffix: {ComponentName}.module.css.
- Import: import styles from './{ComponentName}.module.css';
- Apply classes: className={styles.container} — NEVER use raw string classNames.
- Multiple classes: className={\`\${styles.header} \${styles.active}\`}.
- Conditional: className={isActive ? styles.active : styles.inactive}.
- Use camelCase class names in CSS (.playerControls, .trackList) for clean JSX access.
- Every component with visual styling MUST have a corresponding .module.css file.
- DO NOT use Tailwind classes, inline styles, or global CSS classes in components.
- Define shared tokens (colors, spacing) in a global CSS file using custom properties.
- In .module.css files: use CSS custom properties from the global file (var(--color-primary)).`,

    'styled-components': `
- Create semantic styled components: const Container = styled.div\`...\`.
- Use props for dynamic styling: \${props => props.active ? '...' : '...'}.
- Implement a theme via ThemeProvider for consistent tokens.
- No inline styles — everything goes through styled-components.`,

    'scss': `
- Use .scss extension; leverage variables ($primary, $spacing-md), nesting, and mixins.
- Use @use and @forward for modern SCSS modularity (not @import).
- Structure with partials: _variables.scss, _mixins.scss, _reset.scss.
- Define a token system in variables and reference consistently.`,
};
