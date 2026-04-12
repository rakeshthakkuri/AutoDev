# AI Code Generator

A full‑stack AI-powered code generator that turns natural-language prompts into runnable web projects.  
The backend uses Google Gemini 2.5 Flash for analysis, planning and code generation; the frontend provides a focused generation workspace and live preview.

---

## Features

- Generate complete web projects from a single text prompt
- Analysis + planning + multi-file code generation pipeline
- Live preview in the browser via a custom bundler
- File tree explorer and code editor
- Download generated projects as ZIP
- Modern, responsive UI built with React + Vite
- Production-ready backend with rate limiting, logging and Fly.io deployment config

---

## Architecture Overview

- **Frontend**
  - React + TypeScript + Vite SPA
  - Talks to the backend via REST:
    - `POST /api/analyze`
    - `POST /api/plan`
    - `POST /api/generate` (SSE under the hood)
    - `POST /api/bundle`
    - `GET  /health`
  - Live preview iframe renders generated projects with a client-side bundler.

- **Backend**
  - Node.js 22+, Express, `@google/genai`
  - Centralized configuration in `src/config.js`
  - Services for analysis, planning, generation, validation, bundling and zipping
  - Health checks, rate limiting, structured logging
  - Fly.io deployment via `Dockerfile` and `fly.toml`

- **LLM**
  - Google Gemini 2.5 Flash (via `@google/genai`)
  - Prompted for:
    - Requirements analysis
    - File/tree planning
    - File-by-file code generation and fixes

---

## Prerequisites

- Node.js **22+** (required for some runtime features)
- npm (comes with Node)
- Google Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

---

## Environment Variables

### Backend (`backend/.env`)

Create `backend/.env` (or copy from `.env.example`) with at least:

```env
GEMINI_API_KEY=your_gemini_api_key_here

PORT=5001
NODE_ENV=development

# Optional, but recommended
FRONTEND_URL=http://localhost:5173
# CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Optional tuning
# LLM_PROVIDER=gemini
# GEMINI_MODEL=gemini-2.5-flash
# RATE_LIMIT_API=30
# RATE_LIMIT_GENERATION=10
# LOG_LEVEL=info
```

Key notes:

- `GEMINI_API_KEY` is required for any generation.
- `FRONTEND_URL` is used as the default CORS origin if `CORS_ORIGINS` is not set.
- All other values have sensible defaults in `src/config.js`.

### Frontend (`frontend/.env`)

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5001
```

For production builds, set this to your deployed backend URL, for example:

```env
VITE_API_URL=https://ai-code-generator-backend.fly.dev
```

---

## Local Development

### 1. Backend

```bash
cd backend

# Install dependencies
npm install

# (Optional) bootstrap .env from example
cp .env.example .env
# Then edit .env and set GEMINI_API_KEY

# Start dev server
npm run dev
```

The backend runs on `http://localhost:5001` by default.

Useful scripts (from `backend/package.json`):

- `npm run dev` – start the backend with `node --watch`
- `npm test` – run all Node test files under `test/`
- `npm run build` – build check (loads the app entry to ensure dependencies are valid)

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

The frontend runs on `http://localhost:5173` by default.

---

## How It Works (Backend Flow)

1. **Analyze (`POST /api/analyze`)**
   - Takes a freeform project description.
   - Gemini returns a structured spec: project type, features, frameworks, styling, complexity.

2. **Plan (`POST /api/plan`)**
   - Uses the analysis to build a file tree and implementation plan.
   - Identifies required files (HTML, CSS, JS/TS, React components, etc.).

3. **Generate (`POST /api/generate`)**
   - Stepwise, file-by-file code generation with Gemini.
   - Automatic validation and cleanup:
     - Strips markdown fences
     - Attempts auto-fixes for common issues
   - Streams progress back to the frontend.

4. **Bundle & Preview (`POST /api/bundle`)**
   - Assembles generated files into a runnable project, in-memory.
   - Produces an HTML + JS bundle rendered in the frontend’s iframe.

5. **Download (`GET /download/:projectId`)**
   - Generated projects are stored under a `generated` directory.
   - Download as ZIP for local use.

Health endpoint:

- `GET /health` → returns 200 when backend is up.

---

## Backend Internals

### Configuration

- All configuration is centralized in `backend/src/config.js` and driven by environment variables.
- Key sections:
  - `env`, `isDev`, `isProd` – environment flags from `NODE_ENV`.
  - `port` – derived from `PORT` with a default of `5001`.
  - `corsOrigins` – from `CORS_ORIGINS` (comma-separated) or a single `FRONTEND_URL`, with local fallbacks.
  - `llm` – provider-specific configuration for Gemini (default), Anthropic (optional), and OpenAI (future).
  - `rateLimit` – separate limits for general API and generation endpoints.
  - `generation` – timeouts, retries, and concurrency for the generation pipeline.
  - `agent` – maximum steps and fix attempts for the agent/orchestrator.

Configuration is imported once at startup by `backend/src/index.js` and shared across services.

### Express App and Middleware

File: `backend/src/index.js`

- Creates an Express app and HTTP server.
- Middleware stack:
  - `helmet` with CSP/COEP relaxed for preview iframe support.
  - `compression` for gzip responses.
  - `cors` configured using `config.corsOrigins`.
  - `express.json({ limit: '10mb' })` for JSON bodies.
  - Request logger that records method, path, status and duration (excluding `/health`).
  - `express-rate-limit`:
    - `apiLimiter` applied to `/api/`.
    - `generationLimiter` applied to analyze/plan/generate routes.

Routes:

- `healthRouter` – `GET /health`.
- `createDownloadRouter` – `GET /download/:projectId`.
- `createAnalyzeRouter` – `POST /api/analyze`.
- `createPlanRouter` – `POST /api/plan`.
- `createGenerateRouter` – `POST /api/generate`.
- `createBundleRouter` – `POST /api/bundle`.

The HTTP server also implements:

- Graceful shutdown on `SIGINT`/`SIGTERM`.
- Enhanced error handling for `EADDRINUSE`.

### Services

Located under `backend/src/services/`:

- `llm.js`
  - Wraps Google Gemini (`@google/genai`) with a shared client.
  - Exposes constants for framework/styling/complexity options.
  - Defines prompt templates for analyzer, planner and generator.

- `analysis.js`
  - Orchestrates calls to the analyzer LLM prompt.
  - Normalizes and validates the analysis result into a strongly-typed structure.

- `projectGeneration.js`
  - Implements the main generation pipeline:
    - Iterates over planned files.
    - Requests code for each file from the LLM.
    - Validates and optionally auto-fixes code with `validator.js`.
    - Writes files into the `generated` directory.
  - Uses the retry service for robustness.

- `templates.js`
  - Provides framework-specific boilerplate (React, Next.js, Vue, Svelte, Astro, etc.).
  - Generates `package.json`, config files and scaffolding for generated projects.

- `validator.js`
  - Cleans LLM output:
    - Strips markdown fences and extraneous prose.
    - Applies heuristic checks for common syntax issues.
  - Optionally returns a fixed version or flags the file as problematic.

- `bundler.js`
  - Custom bundler that transforms the generated project into a single HTML + JS preview bundle:
    - Detects Tailwind usage and injects CDN if needed.
    - Handles React/JSX transforms and several framework-specific fallbacks.

- `zipper.js`
  - Creates ZIP archives from a project directory for download endpoints.

- `logger.js`
  - Configured Winston logger with rotating file transports and console output.

- `retry.js`
  - Small retry helper with exponential backoff, used by parts of the agent/generation pipeline.

### Agent / Orchestrator

- Located in `backend/src/agents/`.
- Implements a graph-like orchestration of analysis → plan → generation → validation steps.
- Uses configuration from `config.agent` to prevent runaway loops and excessive fix attempts.

### Logging and Observability

- All major operations (analysis, planning, generation, download) are logged with:
  - Timestamp
  - Log level
  - Contextual metadata (e.g. framework, projectId, retry counts)
- Log files are written into `backend/src/logs/` by default and are ignored in `.dockerignore` to keep Docker images slim.

---

## Frontend Internals

### State Management

- Uses [Zustand](https://github.com/pmndrs/zustand) for lightweight state:
  - `frontend/src/store/generation.ts`
    - Holds the current prompt, plan, generated file tree and preview state.
    - Tracks backend connectivity via periodic `/health` checks.
    - Exposes actions to kick off analyze/plan/generate/bundle sequences.
  - `frontend/src/store/settings.ts`
    - Stores UI-level settings such as layout preferences and history.

### API Layer

File: `frontend/src/services/api.ts`

- Centralized API client built on `fetch` (`axios` is only used for some helpers).
- Uses `VITE_API_URL` to build all endpoint URLs.
- Implements:
  - `getHealth` – `GET /health`.
  - `analyzePrompt` – `POST /api/analyze`.
  - `getPlan` – `POST /api/plan`.
  - `generateProject` – `POST /api/generate` via server-sent events (SSE), streaming events back to the store.
  - `bundleProject` – `POST /api/bundle`.

SSE handling:

- `parseSSEStream` reads the response body as a stream, parses `event:` / `data:` lines and dispatches to the caller.
- The generation store plugs this into a reducer-like function to update progress in real time.

### UI Composition

- `frontend/src/components/GenerationLayout.tsx`
  - Main workspace layout (prompt input, code editor, live preview).
  - Implements resizable panes and cursor updates for drag interactions.

- `frontend/src/components/LivePreview.tsx`
  - Renders the generated bundle inside an `<iframe>`.
  - Uses a sandboxed iframe with constrained capabilities while allowing forms and scripts needed for preview.

- `frontend/src/components/FileTree.tsx`
  - Displays the generated file tree with nested folders.
  - Allows selecting a file to view/edit in the editor.

- `frontend/src/components/BackendConnectionBanner.tsx`
  - Uses generation store’s `backendConnected` flag.
  - Shows a non-environment-specific warning when the backend or network is unavailable.

---

## API Reference (High-Level)

| Method | Path                  | Description                                           |
|--------|-----------------------|-------------------------------------------------------|
| GET    | `/health`             | Basic health check for backend and deployment.       |
| POST   | `/api/analyze`        | Analyze natural-language prompt into requirements.   |
| POST   | `/api/plan`           | Turn analysis into a file tree and implementation plan. |
| POST   | `/api/generate`       | Generate code for each planned file (SSE streaming). |
| POST   | `/api/bundle`         | Bundle generated files into a single HTML+JS preview.|
| GET    | `/download/:projectId`| Download an existing generated project as a ZIP.     |

Authentication is not required for local development or the default deployment; if you add auth, you can extend this table with headers and auth flows.

---

## Project Structure

```text
ai-project-generator/
├── backend/
│   ├── src/
│   │   ├── agents/                 # Orchestrator / graph-based agent
│   │   ├── routes/                 # Express routes (analyze, plan, generate, bundle, health, download)
│   │   ├── services/
│   │   │   ├── llm.js              # Gemini client + prompts
│   │   │   ├── analysis.js         # Requirements analysis logic
│   │   │   ├── projectGeneration.js# Generation orchestration
│   │   │   ├── templates.js        # Framework-specific templates
│   │   │   ├── validator.js        # Code validation and auto-fixing
│   │   │   ├── bundler.js          # In-browser bundler for preview
│   │   │   ├── zipper.js           # ZIP creation
│   │   │   ├── logger.js           # Winston-based logging
│   │   │   └── retry.js            # Retry helpers
│   │   ├── validation/             # Input validation
│   │   ├── config.js               # Central configuration (env-driven)
│   │   └── index.js                # Express app bootstrap
│   ├── test/                       # Node tests
│   ├── Dockerfile                  # Backend container definition
│   ├── fly.toml                    # Fly.io app configuration
│   ├── .dockerignore
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── components/             # UI components (Editor, Preview, Sidebar, etc.)
    │   ├── pages/
    │   ├── services/               # API client, download helper, storage
    │   ├── store/                  # Zustand stores (generation, settings)
    │   ├── styles/                 # CSS files for layout, preview, overlays
    │   └── main.tsx / App.tsx
    ├── index.html
    ├── vite.config.ts
    └── package.json
```

---

## Deployment (Backend on Fly.io)

The repo includes everything needed to deploy the backend to Fly.io:

- `backend/Dockerfile` – Node 22 Alpine image, installs deps, runs build check, starts with `npm start`.
- `backend/fly.toml` – Fly app configuration (http service, health checks, scaling).

Typical steps:

```bash
cd backend

# Log in
flyctl auth login

# First-time app creation (if not already created)
flyctl launch --no-deploy

# Set secrets
flyctl secrets set \
  GEMINI_API_KEY="your_real_gemini_key" \
  FRONTEND_URL="https://your-frontend.example.com" \
  BACKEND_URL="https://ai-code-generator-backend.fly.dev"

# Deploy
flyctl deploy
```

After deploy, your backend will be available at a URL like:

```text
https://ai-code-generator-backend.fly.dev
```

Update `VITE_API_URL` in `frontend/.env` to point to that URL and rebuild the frontend for production.

---

## Tech Stack

- **Frontend**
  - React
  - TypeScript
  - Vite
  - Tailwind CSS
  - Lucide React

- **Backend**
  - Node.js
  - Express
  - `@google/genai` (Gemini)
  - Winston, Helmet, compression, express-rate-limit

- **AI**
  - Google Gemini 2.5 Flash

---

## License

This project is provided as-is for educational and experimental use. Update this section with a formal license (e.g. MIT) if you plan to open-source or distribute it. 
