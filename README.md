# AI Code Generator

A full-stack AI-powered code generator that creates web projects from natural language descriptions using Google Gemini 2.5 Flash.

## Features

- 🚀 Generate complete web projects from text prompts
- 📝 Real-time code generation with progress tracking
- 👁️ Live preview of generated projects
- 📁 File tree navigation
- 💾 Download projects as ZIP files
- 🎨 Modern, responsive UI
- 🤖 Powered by Google Gemini 2.5 Flash

## System Flow

1. **Analysis Phase** (`POST /api/analyze`)
   - The user's prompt is sent to the backend.
   - Gemini analyzes the request to determine project type, required framework, and key features.

2. **Planning Phase** (`POST /api/plan`)
   - Based on the analysis, Gemini creates a detailed file structure and implementation plan.
   - It identifies necessary files (HTML, CSS, JS, or React components).

3. **Generation Phase**
   - The frontend triggers generation via the REST API.
   - The backend generates code for each file sequentially using Gemini.
   - Each file is validated and "cleaned" to remove markdown artifacts or system prompts.
   - Generated files are streamed back to the frontend immediately.

4. **Live Preview**
   - The frontend receives the code and builds a virtual file system.
   - An in-browser bundler renders the application in real-time.

## Prerequisites

- Node.js 22+ (Required for `--watch` flag)
- Google Gemini API Key (from [Google AI Studio](https://aistudio.google.com/apikey))

## Setup

### 1. Backend Setup

The backend is built with Node.js and Express, utilizing `@google/genai` (Gemini 2.5 Flash).

```bash
cd backend

# Install dependencies
npm install

# Setup Environment Variables
cp .env.example .env
# Open .env and add your GEMINI_API_KEY
```

### 2. Frontend Setup

The frontend is a React application built with Vite.

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## Running the Application

1. **Start the Backend:**
   In one terminal:
   ```bash
   cd backend
   npm run dev
   ```
   The backend will start on `http://localhost:5001`.

2. **Start the Frontend:**
   In another terminal:
   ```bash
   cd frontend
   npm run dev
   ```
   The frontend will start on `http://localhost:5173`.

3. **Usage:**
   - Open `http://localhost:5173` in your browser.
   - Enter a project description (e.g., "Create a todo app").
   - Click "Generate" and watch the AI build your project in real-time.

## Project Structure

```
ai-project-generator/
├── backend/
│   ├── src/
│   │   ├── services/
│   │   │   ├── llm.js        # Gemini integration & prompt handling
│   │   │   ├── templates.js  # React project templates
│   │   │   ├── validator.js  # Code validation & auto-fixing
│   │   │   ├── analysis.js   # Requirement analysis
│   │   │   └── projectGeneration.js # Generation orchestration
│   │   └── index.js          # Express server, routing and middleware
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/       # React components (FileTree, LivePreview, etc.)
│   │   └── services/         # Frontend services
│   └── package.json
```

## Technologies

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Lucide React
- **Backend:** Node.js, Express
- **AI:** Google Gemini 2.5 Flash
