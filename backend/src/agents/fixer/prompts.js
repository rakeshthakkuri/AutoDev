/**
 * Fixer agent prompts.
 */

export const TARGETED_FIX_PROMPT = `Fix the following error in {filePath}.

ERROR: {errorMessage}

This file must conform to these contracts:
- Default export: {expectedDefaultExport}
- Named exports: {expectedNamedExports}
- Must import from: {requiredImports}
{propsLine}

{contextSection}

CURRENT CODE:
\`\`\`
{currentCode}
\`\`\`

Return ONLY the corrected complete file. No markdown fences. No explanations.`;

// ─────────────────────────────────────────────────────────────────────────────
// V2 Fixer Prompt — structured error classification and contract preservation
// ─────────────────────────────────────────────────────────────────────────────

export const FIXER_PROMPT_V2 = `You are a code-repair agent. Fix the errors in the file below and return the COMPLETE corrected file.

FILE: {filePath}

─── ERROR REPORT ───
{errors}

─── ERROR CATEGORIES & FIX STRATEGIES ───

SYNTAX ERRORS (missing brackets, unterminated strings, unexpected tokens):
→ Carefully match every opening brace/bracket/parenthesis with its closing counterpart.
→ Ensure all template literals, strings, and JSX expressions are properly terminated.
→ Verify the file is syntactically valid JavaScript/JSX from first line to last.

IMPORT ERRORS (unresolved imports, wrong specifiers, missing modules):
→ Check {projectContext} to see which files exist and what they export.
→ ANTI-HALLUCINATION: Do NOT add imports for files or packages that do not exist in the project. If an import cannot be resolved, remove it or replace it with an inline implementation.
→ Use default vs named imports to match what the target file actually exports.

EXPORT ERRORS (missing default export, mismatched named exports):
→ The file MUST provide the exports listed in the contract below.
→ If a default export is missing, add "export default <ComponentName>;" at the bottom.
→ If named exports are missing, add them without removing existing ones.

TRUNCATION ERRORS (file cut off mid-statement, unterminated JSX, incomplete function):
→ The file was cut short during generation. You MUST return the COMPLETE file from the very first line to the very last.
→ Do NOT output only the missing tail — output the entire file.
→ If the component is too large to fit, simplify secondary sections while keeping all core functionality.
→ Ensure every JSX tag is closed, every function body is complete, and the file ends with a valid export.

─── CONTRACT (CRITICAL — the fixed file MUST satisfy these) ───
{contracts}

─── RULES ───
1. MINIMAL DIFF: Fix ONLY the reported errors. Do not refactor, rename, or reorganize working code.
2. COMPLETE OUTPUT: Return the entire file, not a partial patch.
3. NO MARKDOWN: Do not wrap the output in code fences or add any explanation text.
4. ANTI-HALLUCINATION: Do not invent imports, files, or packages that are not present in the project context.

─── CURRENT CODE ───
{currentCode}

─── PROJECT CONTEXT (other files for reference) ───
{projectContext}

Output ONLY the corrected complete code for {filePath}. No markdown fences. No explanations.`;

export const CROSS_FILE_FIX_PROMPT = `Fix the import/export issues in {filePath}.

ISSUES:
{issues}

OTHER PROJECT FILES AND THEIR EXPORTS:
{fileContracts}

CURRENT CODE:
\`\`\`
{currentCode}
\`\`\`

Fix ALL import statements to match the actual exports of the target files.
Return ONLY the corrected complete file. No markdown fences. No explanations.`;

// ─────────────────────────────────────────────────────────────────────────────
// V2 Import Fix Prompt — targeted import/export repair when surgical fix fails
// ─────────────────────────────────────────────────────────────────────────────

export const IMPORT_FIX_PROMPT_V2 = `Fix ONLY the import/export issue in this file. Do not change anything else.

ISSUE: {issueType} — {issueMessage}
FILE: {filePath}
CURRENT IMPORT: {importStatement}
TARGET FILE EXPORTS: {targetExports}

Fix the import to match what the target file actually exports. Return the complete file with ONLY the import line changed.

CURRENT CODE:
{currentCode}

Return ONLY the corrected complete file. No markdown fences. No explanations.`;
