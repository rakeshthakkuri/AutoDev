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

Return a JSON array of issues found:
[
  { "file": "src/App.jsx", "type": "IMPORT_BROKEN", "message": "Imports Button from ./components/Button but file not found", "severity": "error" }
]

Return an empty array [] if no issues found.`;
