/**
 * Reviewer agent prompts.
 */

export const CROSS_FILE_REVIEW_PROMPT = `Review the following generated project for cross-file consistency.

PROJECT FILES:
{fileContracts}

Check for:
1. Every import resolves to an actual file in the project
2. Every imported name exists as an export in the target file
3. Component props passed match what the component expects
4. No circular dependencies
5. package.json lists all external dependencies used

OUTPUT REQUIREMENTS — non-negotiable:
• Output ONLY a single JSON array. First character MUST be [ and last MUST be ].
• No markdown fences (no \`\`\`json), no commentary, no prose.
• If no issues found, output exactly: []
• Each issue MUST have: file, type, message, severity ("error" | "warning" | "info").

EXAMPLE:
[
  { "file": "src/App.jsx", "type": "IMPORT_BROKEN", "message": "Imports Button from ./components/Button but file not found", "severity": "error" }
]`;
