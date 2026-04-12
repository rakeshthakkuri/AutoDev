# Backend Architecture Report

**AI Code Generator — Backend Service**
**Date:** March 22, 2026
**Stack:** Node.js · Express 5 · Google Gemini · LangGraph · Babel

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [File Structure](#2-file-structure)
3. [Server & Configuration](#3-server--configuration)
4. [API Endpoints](#4-api-endpoints)
5. [Generation Pipeline — Full Data Flow](#5-generation-pipeline--full-data-flow)
6. [Services Layer](#6-services-layer)
7. [Agent Orchestration (LangGraph)](#7-agent-orchestration-langgraph)
8. [Bundler — In-Browser Preview](#8-bundler--in-browser-preview)
9. [Validation & Auto-Repair](#9-validation--auto-repair)
10. [Error Handling & Resilience](#10-error-handling--resilience)
11. [Caching Strategy](#11-caching-strategy)
12. [Security & Rate Limiting](#12-security--rate-limiting)
13. [Deployment](#13-deployment)
14. [Dependencies](#14-dependencies)
15. [Testing](#15-testing)

---

## 1. High-Level Overview

The backend is a Node.js Express service that powers an AI code generation platform. A user describes a web app in plain English; the backend analyzes the prompt, plans a file structure, generates each file via Google Gemini, validates/repairs the output, bundles it for live preview, and provides ZIP download.

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Prompt  │────▶│ Analyze  │────▶│  Plan    │────▶│ Generate │────▶│  Bundle  │
│  (user)  │     │  (LLM)   │     │  (LLM)   │     │ (LLM+SSE)│     │ (Babel)  │
└─────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
                                                        │
                                                   ┌────▼────┐
                                                   │Validate │
                                                   │+ Repair │
                                                   └────┬────┘
                                                        │
                                                   ┌────▼────┐
                                                   │ Preview │
                                                   │  / ZIP  │
                                                   └─────────┘
```

**Supported frameworks:** React, React+TS, Next.js, Vue, Svelte, Angular, Astro, Vanilla JS
**Supported styling:** Tailwind CSS, Plain CSS, CSS Modules, Styled Components, SCSS
**Complexity tiers:** Simple (3–5 files), Standard (5–10 files), Advanced (8–20 files)

---

## 2. File Structure

```
backend/
├── src/
│   ├── index.js                           # Express server entry point
│   ├── config.js                          # Centralized configuration & env vars
│   │
│   ├── routes/
│   │   ├── health.js                      # GET  /health
│   │   ├── analyze.js                     # POST /api/analyze
│   │   ├── plan.js                        # POST /api/plan
│   │   ├── generate.js                    # POST /api/generate (SSE stream)
│   │   ├── bundle.js                      # POST /api/bundle
│   │   └── download.js                    # GET  /download/:projectId
│   │                                      # POST /download/zip
│   │
│   ├── services/
│   │   ├── llm.js                         # LLM provider abstraction & prompt engineering
│   │   ├── analysis.js                    # Prompt analysis & project planning
│   │   ├── projectGeneration.js           # Generation orchestration & file streaming
│   │   ├── bundler.js                     # Babel transform, CDN resolution, preview HTML
│   │   ├── validator.js                   # Code validation & auto-fix
│   │   ├── agentFixer.js                  # LLM-powered code repair loop
│   │   ├── templates.js                   # Fallback templates for all 8 frameworks
│   │   ├── cache.js                       # LRU cache for analysis & plans
│   │   ├── retry.js                       # Retry handler + circuit breaker
│   │   ├── zipper.js                      # ZIP file creation (archiver)
│   │   └── logger.js                      # Winston logging configuration
│   │
│   ├── agents/
│   │   ├── index.js                       # Agent module exports
│   │   ├── graph.js                       # LangGraph state machine (primary orchestrator)
│   │   ├── orchestrator.js                # Alternative agentic loop (not primary)
│   │   └── tools.js                       # Tool definitions (generate, validate, fix)
│   │
│   └── validation/
│       └── requirements.js                # Input validation for /api/plan
│
├── test/
│   ├── api.test.js                        # API integration tests (supertest)
│   └── services/
│       ├── validator.test.js              # Validator unit tests
│       ├── templates.test.js              # Template unit tests
│       └── retry.test.js                  # Retry/circuit breaker tests
│
├── package.json
├── Dockerfile                             # Fly.io deployment
├── .env.example                           # Environment variable reference
└── .env                                   # Local dev config (gitignored)
```

---

## 3. Server & Configuration

### 3.1 Entry Point
**File:** `src/index.js`

The Express 5 server starts on port **5001** (configurable via `PORT`). Key middleware in order:

| Middleware | Purpose |
|---|---|
| `helmet()` | Security headers (CSP disabled for preview iframes) |
| `compression()` | Gzip/brotli response compression |
| `cors()` | Environment-driven origin allowlist |
| `express.json()` | Body parser, 10 MB limit |
| Request logger | Logs method, path, status, duration (excludes `/health`) |
| Rate limiters | Two tiers: API (30/min) and generation (10/min) |

**Graceful shutdown:** Handles `SIGTERM`/`SIGINT`, drains idle connections, force-closes after 4 seconds.

### 3.2 Configuration
**File:** `src/config.js`

All configuration is centralized and exported as a single `config` object. Key groups:

| Group | Key Variables | Defaults |
|---|---|---|
| **Server** | `PORT`, `NODE_ENV`, `CORS_ORIGINS` | 5001, development |
| **LLM** | `LLM_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL` | gemini, gemini-2.5-flash |
| **Anthropic** (opt) | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | claude-sonnet-4-20250514 |
| **OpenAI** (opt) | `OPENAI_API_KEY`, `OPENAI_MODEL` | gpt-4o |
| **Generation** | `MAX_FILE_TIMEOUT`, `MAX_TOTAL_TIMEOUT`, `MAX_RETRIES` | 240s, 600s, 3 |
| **Agent** | `AGENT_MAX_STEPS`, `AGENT_MAX_FIX_ATTEMPTS` | 500, 2 |
| **Rate Limits** | `RATE_LIMIT_API`, `RATE_LIMIT_GENERATION` | 30/min, 10/min |
| **Tokens** | `LLM_MAX_TOKENS`, `LLM_MAX_TOKENS_LARGE`, `LLM_TEMPERATURE` | 4096, 8192, 0.1 |

**Single source of truth for allowed values:**
```js
// src/config.js
frameworks: ['vanilla-js','react','react-ts','nextjs','vue','svelte','angular','astro']
stylingOptions: ['tailwind','plain-css','css-modules','styled-components','scss']
complexityLevels: ['simple','intermediate','advanced']
```

---

## 4. API Endpoints

### 4.1 `GET /health`
**File:** `src/routes/health.js`

Returns server status, uptime, version, and supported frameworks. Used by the frontend for connection checks.

```json
{
  "status": "healthy",
  "timestamp": "2026-03-22T10:00:00.000Z",
  "uptime": 3600,
  "version": "2.0.0",
  "frameworks": ["vanilla-js", "react", "react-ts", "nextjs", "vue", "svelte", "angular", "astro"]
}
```

---

### 4.2 `POST /api/analyze`
**File:** `src/routes/analyze.js`

Parses a user prompt into structured technical requirements.

**Request:**
```json
{
  "prompt": "Create a SaaS landing page with hero, pricing, and testimonials",
  "framework": "auto",
  "styling": "auto"
}
```

**Response:**
```json
{
  "projectType": "landing-page",
  "features": ["hero section", "pricing table", "testimonials"],
  "framework": "react",
  "stylingFramework": "tailwind",
  "complexity": "intermediate",
  "designIntent": {
    "styleDirection": "premium-modern",
    "targetAudience": "startup founders",
    "conversionGoal": "signup",
    "qualityBar": "premium"
  },
  "sessionId": "uuid-v4"
}
```

**Validation:** Prompt required, max 10,000 chars. Framework/styling override auto-detection if provided.

---

### 4.3 `POST /api/plan`
**File:** `src/routes/plan.js`

Creates the project file structure and design system tokens from the analysis.

**Request:**
```json
{
  "requirements": {
    "framework": "react",
    "stylingFramework": "tailwind",
    "complexity": "intermediate",
    "features": ["hero", "pricing", "testimonials"]
  }
}
```

**Response:**
```json
{
  "files": [
    { "path": "index.html", "purpose": "HTML entry point" },
    { "path": "src/main.jsx", "purpose": "React mount" },
    { "path": "src/App.jsx", "purpose": "Main app component" },
    { "path": "src/components/Hero.jsx", "purpose": "Hero section" }
  ],
  "techStack": ["React", "Vite", "Tailwind CSS"],
  "designSystem": {
    "primaryColor": "#3B82F6",
    "colorPalette": { "background": "#FFF", "text": "#111827" },
    "fontFamily": "Inter, sans-serif",
    "typeScale": { "display": "48px", "h1": "32px", "body": "16px" },
    "spacingScale": ["4px", "8px", "16px", "24px", "48px"],
    "motion": { "durationFast": "150ms", "easing": "cubic-bezier(0.4,0,0.2,1)" }
  }
}
```

**Validation:** Uses `src/validation/requirements.js` — framework, styling, and complexity must be from the allowed lists in config.

---

### 4.4 `POST /api/generate` (Server-Sent Events)
**File:** `src/routes/generate.js`

The core generation endpoint. Streams progress back to the client via SSE.

**Request:**
```json
{
  "prompt": "Create a SaaS landing page...",
  "requirements": { ... },
  "plan": { "files": [...], "designSystem": {...} }
}
```

**SSE Event Types:**

| Event | Payload | When |
|---|---|---|
| `status` | `{message, progress, generationId}` | Phase transitions |
| `generation_plan` | `{files, techStack, framework}` | After file sort |
| `file_chunk` | `{path, chunk}` | During streaming generation |
| `file_generated` | `{path, content, validation}` | File complete |
| `file_fixing` | `{path, attempt, errors}` | Auto-repair in progress |
| `file_fixed` | `{path, content, validation}` | Repair succeeded |
| `file_error` | `{path, error}` | File failed all retries |
| `generation_complete` | `{projectId, downloadUrl, metrics}` | All files done |
| `generation_error` | `{error, filesGenerated, partialSuccess}` | Fatal failure |

**Session deduplication:** Tracks active generations per `X-Session-Id` header. Returns **409 Conflict** if a generation is already in-flight for the same session. Stale sessions cleaned every 15 seconds.

---

### 4.5 `POST /api/bundle`
**File:** `src/routes/bundle.js`

Transforms generated project files into a single HTML document for in-browser preview.

**Request:**
```json
{
  "files": {
    "src/App.jsx": "import React from 'react'...",
    "src/index.css": "body { margin: 0 }",
    "index.html": "<!DOCTYPE html>..."
  }
}
```

**Response:**
```json
{
  "html": "<!DOCTYPE html><html>...bundled preview...</html>",
  "projectType": "REACT",
  "errors": [],
  "warnings": []
}
```

---

### 4.6 `GET /download/:projectId` and `POST /download/zip`
**File:** `src/routes/download.js`

Two download modes:
- **GET** `/download/:projectId` — downloads a previously generated project from disk
- **POST** `/download/zip` — creates an in-memory ZIP from a file map (max 200 files)

Both return `application/zip` with `Content-Disposition: attachment`.

**Security:** Path traversal protection — rejects `..`, `/`, `\` in projectId.

---

## 5. Generation Pipeline — Full Data Flow

```
USER PROMPT
    │
    ▼
┌─────────────────────────────────────────────┐
│  1. POST /api/analyze                       │
│     src/services/analysis.js                │
│     - Check LRU cache (SHA256 key)          │
│     - Call Gemini with ANALYZER_PROMPT       │
│     - Parse JSON → projectType, features,   │
│       framework, styling, designIntent       │
│     - Cache result (30 min TTL)              │
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│  2. POST /api/plan                          │
│     src/services/analysis.js                │
│     - Check plan cache                       │
│     - Lookup FRAMEWORK_FILE_STRUCTURES       │
│     - Call Gemini with PLANNER_PROMPT        │
│     - Parse JSON → files[], designSystem     │
│     - Cache result (30 min TTL)              │
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│  3. POST /api/generate (SSE)                │
│     src/services/projectGeneration.js       │
│     - Sanitize requirements                  │
│     - Create project directory               │
│     - Invoke LangGraph state machine ────────┼──┐
└──────────────────┬──────────────────────────┘  │
                   │                              │
                   ▼                              │
┌─────────────────────────────────────────────┐  │
│  4. LangGraph (src/agents/graph.js)         │◀─┘
│                                             │
│  emit_plan → sort files by dependency       │
│       │                                     │
│       ▼                                     │
│  SEQUENTIAL PHASE (critical files first)    │
│  ┌─────────────────────────────────────┐    │
│  │  For each file:                     │    │
│  │  1. Build prompt with context       │    │
│  │  2. Stream LLM → file_chunk events  │    │
│  │  3. Validate output                 │    │
│  │  4. If invalid → AgentFixer (2x)    │    │
│  │  5. If still invalid → template     │    │
│  │  6. Emit file_generated event       │    │
│  └─────────────────────────────────────┘    │
│       │                                     │
│       ▼                                     │
│  CONCURRENT PHASE (independent components)  │
│  ┌─────────────────────────────────────┐    │
│  │  Batch generate (3 at a time)       │    │
│  │  Same validate → fix → fallback     │    │
│  └─────────────────────────────────────┘    │
│       │                                     │
│       ▼                                     │
│  REVIEW PHASE                               │
│  ┌─────────────────────────────────────┐    │
│  │  Validate all files                 │    │
│  │  Check import/export consistency    │    │
│  │  Fix cross-file issues if needed    │    │
│  └─────────────────────────────────────┘    │
│       │                                     │
│       ▼                                     │
│  generation_complete event                  │
└─────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  5. POST /api/bundle (client requests)      │
│     src/services/bundler.js                 │
│     - Detect project type                    │
│     - Transform JSX/TSX with Babel           │
│     - Resolve imports → CDN or registry      │
│     - Build sandboxed preview HTML           │
│     - Return single HTML document            │
└─────────────────────────────────────────────┘
```

---

## 6. Services Layer

### 6.1 LLM Service — `src/services/llm.js`
**Lines:** 657 | **Role:** LLM abstraction, prompt engineering, token management

The LLM service is the interface to the AI model. It manages:

**Multi-provider support:**
- **Google Gemini** (primary) — `@google/genai` SDK
- **Anthropic Claude** (optional) — `@anthropic-ai/sdk`
- **OpenAI** (future) — not yet active

**Prompt system:**

| Prompt | Purpose | Location |
|---|---|---|
| `ANALYZER_PROMPT` | Parse user intent → structured JSON | Line 30 |
| `PLANNER_PROMPT` | Create file structure + design tokens | Line 67 |
| `FRAMEWORK_PROMPTS` | Per-framework code generation rules | Line 141 |
| `STYLING_INSTRUCTIONS` | Per-styling-framework guides | Line 291 |

**Key exports:**

| Function | Purpose |
|---|---|
| `buildCodeGenPrompt()` | Assemble full generation prompt with inter-file context |
| `getMaxTokens()` | Token budget per file type & complexity (2048–8192) |
| `initializeModel()` | Initialize Gemini client |
| `generateCompletion()` | Non-streaming LLM call |
| `generateFix()` | Low-temperature repair call |
| `generateCompletionStream()` | Streaming LLM call for file generation |

**Inter-file context building** (`buildContextPrompt`, line 424):
- Extracts exports, interfaces, function signatures from already-generated files
- Prioritizes: config files > global styles > same-directory files
- Capped at 10 files per request to manage token budget

**Token allocation:**

| File Type | Simple | Standard | Advanced |
|---|---|---|---|
| Config/JSON | 2048 | 2048 | 2048 |
| HTML/Layout | 4096 | 4096 | 8192 |
| Main App | 4096 | 4096 | 8192 |
| CSS | 4096 | 4096 | 6144 |
| Components | 4096 | 4096 | 6144 |

---

### 6.2 Analysis Service — `src/services/analysis.js`
**Lines:** 1,008 | **Role:** Prompt analysis, project planning, framework file structures

**Class:** `AnalysisService`

**Methods:**
- `analyzePrompt(userPrompt, options)` — LLM-powered prompt analysis with caching
- `generatePlan(requirements)` — File structure planning with design system tokens

**Data:**
- `FRAMEWORK_FILE_STRUCTURES` (lines 7–236) — Hard-coded file structures for all 8 frameworks at all 3 complexity levels. Example:
  - React/simple: 5 files (index.html, main.jsx, App.jsx, index.css, package.json)
  - Next.js/advanced: 15 files (app router layout, pages, API routes, components, configs)

**Quality controls:**
- Landing page quality rubric emphasizing conversion, semantic sections, typography scale, spacing rhythm, accessibility, and motion
- Brief prompts default to "premium-modern" quality bar
- Real-world copy preferred over placeholder text

---

### 6.3 Project Generation Service — `src/services/projectGeneration.js`
**Lines:** 858 | **Role:** Orchestrate full project generation

**Class:** `ProjectGenerationService`

**Constructor dependencies:**
- `CodeValidator` — for validating generated code
- `RetryHandler` — for resilient LLM calls
- `AgentFixer` — for LLM-powered repair

**Key methods:**

| Method | Purpose |
|---|---|
| `generateProject(config)` | Main entry — creates dir, invokes LangGraph, returns result |
| `_generateSingleFile(config)` | Generate one file with validate → fix → fallback cascade |
| `_generateFile(config)` | Stream LLM output for one file (with 240s timeout) |
| `_sortFiles()` | Topological sort by dependency |
| `_classifyDependencies()` | Separate sequential vs. concurrent files |

**File generation cascade:**
1. LLM generation (streaming) → validate
2. If invalid: `AgentFixer.fixFileWithFeedback()` (up to 2 attempts)
3. If still invalid: recovery-mode generation
4. If still invalid: template fallback (`getTemplate()`)
5. If template fails: emit `file_error` event

---

### 6.4 Bundler Service — `src/services/bundler.js`
**Lines:** 1,047 | **Role:** Transform code for in-browser preview

See [Section 8](#8-bundler--in-browser-preview) for detailed breakdown.

---

### 6.5 Validator Service — `src/services/validator.js`
**Lines:** 1,054 | **Role:** Code validation and auto-fix

See [Section 9](#9-validation--auto-repair) for detailed breakdown.

---

### 6.6 Agent Fixer — `src/services/agentFixer.js`
**Lines:** 301 | **Role:** LLM-powered code repair

**Class:** `AgentFixer`

**Method:** `fixFileWithFeedback(config)` — iterative repair loop

1. Detects truncation errors (uses higher token limit and more attempts)
2. For each attempt (1 to `maxFixAttempts`):
   - Builds repair prompt with error annotations and inter-file context
   - Calls `generateFix()` at temperature 0.1
   - Strips markdown artifacts
   - Re-validates
   - If valid: returns `{code, validation, fixed: true, attempts}`
3. Falls back to original code if all attempts fail

---

### 6.7 Templates Service — `src/services/templates.js`
**Lines:** 1,154 | **Role:** Fallback templates for all frameworks

**Export:** `getTemplate(filePath, config)` — returns a minimal working template for any file path

**Template categories:**
- `package.json` — framework-specific dependencies and scripts
- Config files — `tsconfig.json`, `vite.config.js`, `tailwind.config.js`, `next.config.js`
- Component stubs — minimal working components per framework
- Layout templates — responsive sections for landing pages, dashboards

---

### 6.8 Supporting Services

| Service | File | Purpose |
|---|---|---|
| **Cache** | `src/services/cache.js` (89 lines) | LRU caches for analysis (200 entries, 30 min) and plans (100 entries, 30 min). SHA256 hash keys. |
| **Retry** | `src/services/retry.js` (147 lines) | Exponential backoff (max 15s, ±30% jitter) with circuit breaker (opens after 8 failures, resets in 60s). |
| **Zipper** | `src/services/zipper.js` (49 lines) | In-memory ZIP creation via `archiver` at max compression. |
| **Logger** | `src/services/logger.js` (41 lines) | Winston logger — `app.log` (all levels), `error.log` (errors only). 5 MB rotation, 5 files max. |

---

## 7. Agent Orchestration (LangGraph)

**File:** `src/agents/graph.js` (278 lines)

The generation pipeline uses a **LangGraph state machine** for deterministic, resumable orchestration.

### State Schema
```
GenerationState {
  generationId       // UUID
  plan               // File plan from /api/plan
  requirements       // Analysis results
  userPrompt         // Original user input
  projectDir         // Disk path for output
  generatedFiles     // { path: code } accumulator
  sortedFiles        // Files in dependency order
  sequential[]       // Critical files (configs, layouts)
  concurrent[]       // Independent components
  phase              // SEQUENTIAL | CONCURRENT | REVIEW | DONE
  sequentialIndex    // Current position in sequential queue
  concurrentIndex    // Current position in concurrent queue
  filesCompleted     // Counter
  structureWarnings  // Cross-file issues found in review
  stepCount          // Loop counter (max 500)
}
```

### Graph Nodes

| Node | Purpose |
|---|---|
| `emit_plan` | Sort files, split sequential/concurrent, emit plan event |
| `generate_file` | Generate one file via `_generateSingleFile()` tool |
| `validate_project` | Validate all files, check import/export consistency |
| `fix_cross_file` | Repair broken cross-file references |

### Graph Flow
```
START → emit_plan ──▶ generate_file ──▶ ... ──▶ validate_project ──▶ END
                         ▲     │                      │
                         └─────┘                      ▼
                       (loop until              fix_cross_file
                        all files done)               │
                                                      ▼
                                                     END
```

### Tools — `src/agents/tools.js` (201 lines)

| Tool | Action |
|---|---|
| `generate_file` | Calls `service._generateSingleFile()` |
| `fix_file` | Repairs a single file |
| `validate_project` | Validates all generated files |
| `fix_cross_file` | Fixes import/export mismatches across files |
| `write_file` | Writes file to disk |

---

## 8. Bundler — In-Browser Preview

**File:** `src/services/bundler.js` (1,047 lines)

The bundler transforms a set of generated source files into a single HTML document that runs in a sandboxed iframe — no build tools needed on the client.

### Pipeline

```
Generated Files
      │
      ▼
detectProjectType()           → REACT | VUE | SVELTE | HTML | NEXTJS | ANGULAR | ASTRO
      │
      ▼
Framework-specific bundler
      │
      ├── Find entry file (main.jsx > index.jsx > App.jsx)
      ├── Transform JSX/TSX with Babel
      ├── Resolve imports:
      │     ├── Local files → window.__Component_<Name> registry
      │     ├── CDN packages → jsDelivr script tags
      │     └── Inline shims → uuid, clsx, classnames
      ├── Extract & concatenate CSS
      ├── Inject Tailwind CDN if detected
      ├── Build sandboxed HTML with:
      │     ├── Sandbox shims (localStorage, cookies, etc.)
      │     ├── CDN script tags
      │     ├── Component registry
      │     └── React mount script
      └── Return { html, projectType, errors, warnings }
```

### Import Handling (6 steps)

| Step | Pattern | Resolution |
|---|---|---|
| 0 | Asset imports (`.css`, `.svg`, `.png`) | `const x = {};` stub |
| 1 | Default imports — local | `safeComponentRef(name)` with typeof guard |
| 1 | Default imports — external | CDN registry lookup |
| 1b | Named imports — local | `safeComponentRef()` per name |
| 2 | Named imports — external | CDN globals or warning stub |
| 3 | Namespace imports | CDN global or `{}` |
| 4 | Combined imports | Split and handle individually |
| 5 | Remaining imports | Strip |

### CDN Package Registry

**Inline shims (no network):**
- `uuid` → `crypto.randomUUID()` polyfill
- `clsx`, `classnames` → class joining utility

**jsDelivr CDN:**
lodash, axios, dayjs, date-fns, react-router-dom, recharts, framer-motion, zod, immer, zustand, chart.js

### Babel Transformation
- Presets: `@babel/preset-env`, `@babel/preset-react` (classic runtime)
- Fallback: `@babel/preset-typescript` if JSX parse fails
- Target: `last 2 Chrome versions`
- LRU cache: 100 entries
- Sanitizes BOM + zero-width Unicode before parsing

### Safety: Component Mount Guard
```js
const _rootRaw = window.__Component_App;
if (typeof _rootRaw === 'function') {
  ReactDOM.createRoot(root).render(React.createElement(_rootRaw));
} else {
  root.innerHTML = '<p>Error: Export is not a valid component</p>';
}
```

---

## 9. Validation & Auto-Repair

**File:** `src/services/validator.js` (1,054 lines)

### Validation Flow

```
Raw LLM Output
      │
      ▼
_cleanArtifacts()              → Strip markdown fences, system prompts, URL backticks
      │
      ▼
_isConversationalResponse()    → Reject "I'm an AI" / "Sure, I can" responses
      │
      ▼
Type-specific validator:
  ├── validateHTML()            → DOCTYPE, tag balance, structure
  ├── validateCSS()             → Selectors, at-rules, bracket balance
  ├── validateJavaScript()      → Node.js native parser
  ├── validateJSX()             → React/Vue/Svelte component checks
  ├── validateJSON()            → Parse + structure check
  └── validatePackageJson()     → Scripts + dependency validation
      │
      ▼
Return { isValid, errors[], warnings[], fixedCode?, fixesApplied[] }
```

### Auto-Fix Capabilities
- Missing closing tags (HTML/JSX)
- Unbalanced brackets `{ } [ ] ( )`
- Invalid JSON values (auto-stringify)
- CSS selector issues

### Repair Cascade (when validation fails)
1. **AgentFixer** — LLM repair with error context (2 attempts, temp 0.1)
2. **Recovery generation** — re-generate with explicit constraints
3. **Template fallback** — minimal working template per framework

---

## 10. Error Handling & Resilience

### Retry Handler — `src/services/retry.js`

| Setting | Value |
|---|---|
| Max retries | 3 |
| Backoff | Exponential: `base * 2^attempt` (capped 15s) |
| Jitter | ±30% random delay |
| Circuit breaker | Opens after 8 failures, resets in 60s |

### Circuit Breaker States
```
CLOSED ──(failure threshold)──▶ OPEN ──(reset timeout)──▶ HALF_OPEN
   ▲                                                          │
   └──────────────(success)────────────────────────────────────┘
```

### Error Categories

| Error Type | Handling |
|---|---|
| LLM timeout | Retry with exponential backoff |
| LLM truncation | Re-request with higher max_tokens (up to 3 attempts) |
| Validation failure | AgentFixer → recovery → template fallback |
| Cross-file mismatch | fix_cross_file tool in review phase |
| Circuit open | Fast-fail, template fallback |
| Individual file failure | Log error, continue to next file, partial success |
| Fatal generation failure | Emit `generation_error` event with partial results |

---

## 11. Caching Strategy

| Cache | Max Entries | TTL | Key | Location |
|---|---|---|---|---|
| Analysis | 200 | 30 min | SHA256(prompt + options) | `src/services/cache.js` |
| Plan | 100 | 30 min | SHA256(requirements) | `src/services/cache.js` |
| Babel transforms | 100 | LRU eviction | source code hash | `src/services/bundler.js` |

All caches are in-memory (LRU). No external cache (Redis) is used.

---

## 12. Security & Rate Limiting

| Measure | Implementation |
|---|---|
| **Helmet** | Security headers (strict CSP disabled for preview iframes) |
| **CORS** | Environment-driven allowlist; dev allows localhost:5173/3000 |
| **Rate limiting** | 30 req/min API, 10 req/min generation (express-rate-limit) |
| **Input validation** | Prompt max 10K chars; framework/styling/complexity must match config allowlist |
| **Path traversal** | Download endpoint rejects `..`, `/`, `\` in projectId |
| **ZIP limits** | Max 200 files per ZIP request; all paths must be relative |
| **Body size** | 10 MB JSON limit |
| **Session dedup** | 409 Conflict if generation already running for same client |

---

## 13. Deployment

### Fly.io Configuration
**File:** `Dockerfile`

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
EXPOSE 5001
CMD ["node", "src/index.js"]
```

**Environment variables set on Fly.io:**
- `NODE_ENV=production`
- `GEMINI_API_KEY=<secret>`
- `CORS_ORIGINS=<frontend-url>`
- `FRONTEND_URL=<frontend-url>`

---

## 14. Dependencies

### Production

| Package | Version | Purpose |
|---|---|---|
| `express` | ^5.2.1 | HTTP server |
| `cors` | ^2.8.6 | Cross-origin requests |
| `helmet` | ^8.1.0 | Security headers |
| `compression` | ^1.8.1 | Response compression |
| `express-rate-limit` | ^8.2.1 | Rate limiting |
| `@google/genai` | ^1.41.0 | Google Gemini LLM (primary) |
| `@anthropic-ai/sdk` | ^0.74.0 | Anthropic Claude (optional) |
| `@langchain/core` | ^1.1.26 | LangChain abstractions |
| `@langchain/langgraph` | ^1.1.5 | State machine orchestration |
| `@babel/core` | ^7.29.0 | JSX/TS transpilation |
| `@babel/preset-env` | ^7.29.0 | Modern JS syntax |
| `@babel/preset-react` | ^7.28.5 | JSX support |
| `@babel/preset-typescript` | ^7.28.5 | TypeScript support |
| `lru-cache` | ^11.2.5 | In-memory caching |
| `archiver` | ^7.0.1 | ZIP creation |
| `winston` | ^3.19.0 | Logging |
| `dotenv` | ^17.2.4 | Env loading |

### Dev

| Package | Version | Purpose |
|---|---|---|
| `supertest` | ^7.2.2 | HTTP test assertions |

---

## 15. Testing

**Location:** `backend/test/`

| File | Scope |
|---|---|
| `api.test.js` | Integration tests — health, analyze, plan, generate, bundle endpoints |
| `services/validator.test.js` | Unit tests — validation rules, artifact cleaning, auto-fix |
| `services/templates.test.js` | Unit tests — template existence for all frameworks/file types |
| `services/retry.test.js` | Unit tests — retry backoff, circuit breaker state transitions |

Tests use **supertest** against the Express app instance (no server start needed).

---

*This document was generated from the codebase at `/Users/rakeshpatel/Desktop/AI Project generator/backend/` on March 22, 2026.*
