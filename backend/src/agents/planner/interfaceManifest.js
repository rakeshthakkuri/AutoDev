/**
 * interfaceManifest.js — one LLM call to lock public APIs for every planned file.
 */

import { generateCompletion } from '../../services/llm.js';
import logger from '../../services/logger.js';

function buildManifestPrompt(plan, requirements) {
    const files = (plan.files || []).map(f => (typeof f === 'string' ? f : f.path));
    return `You are a senior software architect. Given this project plan, define the EXACT interface for every file.

PROJECT: ${requirements?.projectType || 'web application'}
FRAMEWORK: ${requirements?.framework || 'react'}
STYLING: ${requirements?.stylingFramework || requirements?.styling || 'tailwind'}

FILES TO DEFINE:
${files.map((f, i) => `${i + 1}. ${f}`).join('\n')}

TECH STACK:
${JSON.stringify(plan.techStack || {}, null, 2)}

For each file, specify:
- exports: exact export names (default + named)
- For React components: props with types and whether required
- For hooks: parameters and return shape
- For services/utils: function signatures
- For context: provided value shape

RULES:
- Be consistent: if Button has a "variant" prop, every file that uses Button must use "variant"
- Use realistic, conventional names (onClick not handleClick, children not content)
- Config files and index.html: just list their purpose, no exports needed
- package.json: list the key dependencies only

Respond with ONLY valid JSON. No markdown, no explanation.

Example shape (one entry; you must include every file path as a key):
{
  "src/components/Button.jsx": {
    "defaultExport": "Button",
    "namedExports": [],
    "props": {
      "variant": { "type": "\\"primary\\" | \\"secondary\\"", "required": false, "default": "\\"primary\\"" },
      "children": { "type": "React.ReactNode", "required": true }
    }
  }
}

Define ALL ${files.length} files. Do not skip any.`;
}

function guessDefaultExport(filePath) {
    const name = filePath.split('/').pop()?.replace(/\.(jsx?|tsx?)$/, '') || '';
    if (/^[A-Z]/.test(name)) return name;
    if (name.startsWith('use')) return null;
    if (/\.(css|html|json)$/.test(filePath)) return null;
    return name;
}

function parseManifest(raw, filePaths) {
    const cleaned = String(raw)
        .replace(/^```(?:json)?\s*/m, '')
        .replace(/\s*```\s*$/m, '')
        .trim();

    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    } catch (err) {
        logger.warn('Manifest JSON parse failed, attempting recovery', { error: err.message });
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                parsed = JSON.parse(match[0]);
            } catch {
                logger.error('Manifest recovery failed — using empty manifest');
                return {};
            }
        } else {
            return {};
        }
    }

    for (const file of filePaths) {
        if (!parsed[file]) {
            parsed[file] = {
                defaultExport: guessDefaultExport(file),
                namedExports: [],
                note: 'Auto-filled — LLM did not specify',
            };
        }
    }

    return parsed;
}

/**
 * @param {object} plan
 * @param {object} requirements
 * @returns {Promise<Record<string, unknown>>}
 */
export async function generateInterfaceManifest(plan, requirements) {
    const filePaths = (plan.files || []).map(f => (typeof f === 'string' ? f : f.path)).filter(Boolean);
    logger.info('Generating interface manifest', { fileCount: filePaths.length });

    const prompt = buildManifestPrompt(plan, requirements);

    try {
        const raw = await generateCompletion(prompt, {
            maxTokens: 8192,
            temperature: 0.1,
            responseMimeType: 'application/json',
        });

        const manifest = parseManifest(raw, filePaths);

        logger.info('Interface manifest generated', {
            filesInPlan: filePaths.length,
            filesCovered: Object.keys(manifest).length,
        });

        return manifest;
    } catch (err) {
        logger.error('Interface manifest generation failed — proceeding without manifest', {
            error: err.message,
        });
        return {};
    }
}

/**
 * @param {Record<string, unknown>} manifest
 * @param {string} currentFile
 * @param {string[]} importedFiles
 */
export function formatManifestForPrompt(manifest, currentFile, importedFiles = []) {
    const lines = [];

    const currentEntry = manifest[currentFile];
    if (currentEntry) {
        lines.push('## THIS FILE\'S REQUIRED INTERFACE (implement exactly this):');
        lines.push('```json');
        lines.push(JSON.stringify({ [currentFile]: currentEntry }, null, 2));
        lines.push('```');
        lines.push('');
    }

    const relevantDeps = importedFiles
        .filter(f => manifest[f])
        .slice(0, 10);

    if (relevantDeps.length > 0) {
        lines.push('## INTERFACES YOU MUST USE (from files you will import):');
        lines.push('```json');
        lines.push(JSON.stringify(Object.fromEntries(relevantDeps.map(f => [f, manifest[f]])), null, 2));
        lines.push('```');
        lines.push('CRITICAL: Use these exact prop names, function signatures, and export names.');
        lines.push('Do not invent alternatives. The interfaces above are the contract.');
    }

    return lines.join('\n');
}
