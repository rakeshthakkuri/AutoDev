/**
 * Editor agent prompts.
 */

export const PROPAGATE_CHANGE_PROMPT = `A file in the project was modified, and this file needs to be updated to stay consistent.

CHANGED FILE: {changedPath}
CHANGE REASON: {reason}

NEW VERSION OF CHANGED FILE:
\`\`\`
{newContent}
\`\`\`

FILE TO UPDATE: {targetPath}
CURRENT CONTENT:
\`\`\`
{targetContent}
\`\`\`

Update the file to be consistent with the changed file. Fix any broken imports, renamed exports, or removed props.
Return ONLY the updated complete file. No markdown fences. No explanations.`;

export const PROMPT_REFINEMENT_PROMPT = `The user wants to modify an existing generated file.

USER'S EDIT REQUEST: {refinementPrompt}

FILE TO UPDATE: {filePath}
CURRENT CONTENT:
\`\`\`
{currentContent}
\`\`\`

PROJECT CONTEXT:
{context}

Apply the user's requested changes to this file. Keep everything that isn't being changed.
Return ONLY the updated complete file. No markdown fences. No explanations.`;

export const FEATURE_ADDITION_PROMPT = `The user wants to add a new feature to an existing project.

USER'S REQUEST: {featurePrompt}

EXISTING PROJECT FILES:
{existingFiles}

Generate the file {filePath} for this new feature.
Make sure it integrates with the existing project — use consistent imports, exports, and styling.
Return ONLY the raw code. No markdown fences. No explanations.`;

// ─────────────────────────────────────────────────────────────────────────────
// V2 Editor Prompts — structured, contract-aware, minimal-diff
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PROPAGATION_PROMPT_V2
 *
 * Used when a direct edit to one file breaks or invalidates dependent files.
 * The LLM receives the precise change description and must surgically update
 * only the references to the changed file.
 */
export const PROPAGATION_PROMPT_V2 = `A file in the project was edited, and a dependent file must be updated to stay compatible.

─── WHAT CHANGED ───
Changed file: {changedPath}
Change type:  {changeType}

Old contract (before the edit):
{oldContract}

New contract (after the edit):
{newContract}

─── FILE TO UPDATE ───
File: {targetPath}

Current content:
\`\`\`
{targetContent}
\`\`\`

─── RULES ───
1. Update ONLY the parts of {targetPath} that reference {changedPath} — imports, prop usage, function calls, type references.
2. Do NOT refactor, restyle, or reorganize any code that is unrelated to the change.
3. Preserve all existing exports, imports from other files, and internal logic that still works.
4. If the change type is "renamed export", update the import specifier and all usages.
5. If the change type is "removed export", remove the import and any code that depends on it (replace with a sensible fallback or remove the UI element).
6. If the change type is "changed props", update the JSX call-sites to match the new prop interface.
7. Return the COMPLETE updated file. No markdown fences. No explanations.

Output ONLY the updated code for {targetPath}.`;

/**
 * REFINEMENT_PROMPT_V2
 *
 * Used when the user requests a natural-language edit to an existing file.
 * The LLM must apply only the requested change and leave everything else intact.
 */
export const REFINEMENT_PROMPT_V2 = `The user wants to modify an existing file in a generated project. Apply their request precisely.

─── USER'S EDIT REQUEST ───
{refinementPrompt}

─── FILE TO MODIFY ───
File: {filePath}

Current content:
\`\`\`
{currentContent}
\`\`\`

─── PROJECT STYLE CONTEXT ───
Design system: {designSystem}
Styling framework: {stylingFramework}

─── RULES ───
1. Apply ONLY the changes the user asked for. Do not refactor, rename, or reorganize anything else.
2. PRESERVE all existing:
   - Default and named exports (do not remove or rename them)
   - Imports from other project files (they depend on the current file graph)
   - Component structure and prop interfaces (unless the user explicitly asked to change them)
3. Match the project's existing design system and styling approach.
4. If the request is ambiguous, prefer the minimal interpretation that satisfies the user's intent.
5. Return the COMPLETE updated file. No markdown fences. No explanations.

Output ONLY the updated code for {filePath}.`;

/**
 * FEATURE_ADDITION_PROMPT_V2
 *
 * Used to generate a brand-new file for an added feature. The LLM must match
 * the coding style, import patterns, and conventions of the existing codebase.
 */
export const FEATURE_ADDITION_PROMPT_V2 = `Generate a new file for a feature the user wants to add to an existing project.

─── USER'S FEATURE REQUEST ───
{featurePrompt}

─── FILE TO GENERATE ───
{filePath}

─── PROJECT STYLE CONTEXT ───
Design system: {designSystem}

─── EXISTING PROJECT FILES (for reference) ───
{existingFiles}

─── EXAMPLE COMPONENT (match this coding style) ───
\`\`\`
{exampleComponent}
\`\`\`

─── RULES ───
1. Match the coding style of the example component above — same import patterns, same export conventions, same naming conventions.
2. Use the same styling approach (CSS modules, Tailwind classes, styled-components, etc.) as the existing files.
3. Import shared components or utilities from the existing project files when appropriate — do NOT re-implement what already exists.
4. Export the new component/module using the same pattern as the example (default export, named exports, or both).
5. Include all necessary imports. Do NOT import files or packages that do not exist in the project.
6. The generated code must be production-ready — no placeholder "TODO" comments, no dummy data unless the feature requires it.
7. Return ONLY the raw code for {filePath}. No markdown fences. No explanations.

Output ONLY the code for {filePath}.`;
