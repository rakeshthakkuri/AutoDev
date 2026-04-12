# Prompt Template Catalog — V2 Agent Pipeline

| ID | Location | Agent | Purpose | Token Est. | Pipeline |
|----|----------|-------|---------|------------|----------|
| P1 | llm.js:30 | Analyzer | Parse user intent into structured JSON spec | ~375 | v2 |
| P2 | llm.js:67 | Planner | Generate file structure + design system tokens | ~700 | v2 |
| P3 | planner/prompts.js:5 | Planner | Fix validation errors in plan (revision) | ~150 | v2 |
| P4a-h | llm.js:142-287 | Coder | Framework-specific code gen rules (8 variants) | ~165-225 each | v2 |
| P5a-e | llm.js:292-336 | Coder | Styling-specific instructions (5 variants) | ~65-200 each | v2 |
| P6 | llm.js:462 | Coder | Export/import rules, no markdown, real content | ~125 | v2 |
| P7 | llm.js:472 | Coder | Landing-page quality rubric | ~100 | v2 |
| P8 | coder/prompts.js:5 | Coder | File contract specification (exports, props) | ~65 | v2 |
| P9 | coder/prompts.js:16 | Coder | Recovery prompt for failed file regeneration | ~100 | v2 |
| P10 | llm.js:424 | Coder | buildContextPrompt — inter-file dependency context | ~200-400 | v2 |
| P11 | reviewer/prompts.js:5 | Reviewer | Cross-file review (imports, exports, props) | ~150 | v2 |
| P12 | fixer/prompts.js:5 | Fixer | Targeted fix for single file errors | ~125 | v2 |
| P13 | fixer/prompts.js:24 | Fixer | Cross-file fix for import/export mismatches | ~100 | v2 |
| P14 | agentFixer.js:208 | Fixer | Dynamic repair prompt (iterative, context-aware) | ~375-750 | v2 |
| P15 | editor/prompts.js:5 | Editor | Propagate changes to dependent files | ~125 | v2 |
| P16 | editor/prompts.js:24 | Editor | Prompt refinement (natural language edits) | ~125 | v2 |
| P17 | editor/prompts.js:40 | Editor | Feature addition to existing project | ~100 | v2 |
| P18 | llm.js:574 | System | Default code gen system instruction | ~40 | both |
| P19 | llm.js:607 | System | Fix/repair system instruction | ~60 | both |

## Key Finding: Thinking Token Budget Issue (FIXED)
Gemini 2.5 Flash uses thinking tokens that count against `maxOutputTokens`. JSON responses with `responseMimeType: 'application/json'` were being truncated because ~764 thinking tokens consumed the 800-token budget, leaving only ~21 tokens for actual output. Fixed by setting `thinkingBudget: 0` for JSON responses.

## Token Flow Per Generation
```
Analysis:  ~375 prompt tokens → ~200 output tokens
Planning:  ~700 prompt tokens → ~500 output tokens
Per file:  ~700-1200 prompt tokens → ~2000-4000 output tokens
Review:    ~150 prompt tokens → ~200 output tokens
Per fix:   ~375-750 prompt tokens → ~2000-4000 output tokens
```
