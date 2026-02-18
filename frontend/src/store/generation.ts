import { create } from 'zustand';
import axios from 'axios';

// In dev, use same origin so Vite proxy forwards to backend (5001). In prod, use env or default.
const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5001');

// ─── Types ───────────────────────────────────────────────────────────────────

interface ErrorDetails {
  code?: string;
  message: string;
  details?: Record<string, any>;
}

interface FileError {
  path: string;
  error: string;
  attempts: number;
}

interface ValidationResult {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  fixes_applied: string[];
}

interface PlannedFile {
  path: string;
  purpose: string;
}

interface GenerationPlan {
  files: PlannedFile[];
  techStack: string[];
  framework: string;
  stylingFramework: string;
}

interface GenerationState {
  // ── Project state
  files: Record<string, string>;
  editedFiles: Record<string, string>;
  isGenerating: boolean;
  progress: number;
  error: ErrorDetails | null;
  backendConnected: boolean;
  fileErrors: Record<string, FileError>;
  validationResults: Record<string, ValidationResult>;
  metrics: { duration?: number; filesGenerated?: number; validation?: any; retries?: any } | null;
  currentPrompt: string;

  // ── Streaming state
  streamingFile: string | null;       // Currently streaming file path
  streamingContent: string;           // Accumulated streaming content (built from deltas)
  generationPlan: GenerationPlan | null;  // Plan received before generation

  // ── Agentic fix state
  fixingFiles: Record<string, { attempt: number; totalAttempts: number; errors: string[] }>;

  // ── User preferences
  selectedFramework: string;          // 'auto' | 'vanilla-js' | 'react' | ...
  selectedStyling: string;            // 'auto' | 'tailwind' | 'plain-css' | ...
  selectedComplexity: string;         // 'simple' | 'intermediate' | 'advanced'

  // ── Actions
  generateProject: (prompt: string) => Promise<void>;
  clearError: () => void;
  retryGeneration: (prompt: string) => Promise<void>;
  saveFileEdit: (path: string, content: string) => void;
  revertFileEdit: (path: string) => void;
  getFileContent: (path: string) => string;
  hasUnsavedChanges: () => boolean;
  clearEdits: () => void;
  loadProject: (files: Record<string, string>, editedFiles?: Record<string, string>, prompt?: string) => void;
  resetProject: () => void;
  cancelGeneration: () => void;
  checkHealth: () => Promise<void>;
  setSelectedFramework: (framework: string) => void;
  setSelectedStyling: (styling: string) => void;
  setSelectedComplexity: (complexity: string) => void;
}

// ─── SSE Stream Parser ───────────────────────────────────────────────────────

interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Parse SSE events from a ReadableStream.
 * Calls `onEvent` for each complete event received.
 */
async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (evt: SSEEvent) => void,
  signal?: AbortSignal,
) {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by double newlines
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        if (!part.trim()) continue;

        let eventName = '';
        let eventData = '';

        for (const line of part.split('\n')) {
          if (line.startsWith('event: ')) {
            eventName = line.slice(7);
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          }
        }

        if (eventName && eventData) {
          onEvent({ event: eventName, data: eventData });
        }
      }
    }
  } catch (err: any) {
    // AbortError is expected when cancelling
    if (err.name !== 'AbortError') {
      throw err;
    }
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────

// Shared abort controller for the active generation SSE stream
let activeAbortController: AbortController | null = null;

export const GenerationStore = create<GenerationState>((set, get) => {
  // ─── Return initial state + actions ────────────────────────────────────────
  return {
    files: {},
    editedFiles: {},
    isGenerating: false,
    progress: 0,
    error: null,
    backendConnected: false,
    fileErrors: {},
    validationResults: {},
    metrics: null,
    currentPrompt: '',
    streamingFile: null,
    streamingContent: '',
    generationPlan: null,
    fixingFiles: {},
    selectedFramework: 'auto',
    selectedStyling: 'auto',
    selectedComplexity: 'simple',

    checkHealth: async () => {
      try {
        const res = await fetch(`${API_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(3000) });
        set({ backendConnected: res.ok });
      } catch {
        set({ backendConnected: false });
      }
    },

    generateProject: async (prompt: string) => {
      const { hasUnsavedChanges, selectedFramework, selectedStyling, selectedComplexity } = get();

      if (hasUnsavedChanges()) {
        const confirmed = window.confirm('You have unsaved changes. Regenerating will discard all edits. Continue?');
        if (!confirmed) return;
      }

      set({
        isGenerating: true,
        progress: 0,
        files: {},
        editedFiles: {},
        error: null,
        fileErrors: {},
        validationResults: {},
        metrics: null,
        currentPrompt: prompt,
        streamingFile: null,
        streamingContent: '',
        generationPlan: null,
        fixingFiles: {},
      });

      try {
        // Health check
        try {
          await axios.get(`${API_URL}/health`, { timeout: 5000 });
          set({ backendConnected: true });
        } catch {
          set({ backendConnected: false });
          throw new Error('Backend server is not responding. Please ensure the server is running on port 5001.');
        }

        // Step 1: Analyze (pass framework/styling preferences)
        const analyzeRes = await axios.post(
          `${API_URL}/api/analyze`,
          { prompt, framework: selectedFramework, styling: selectedStyling },
          { timeout: 60000 }
        );
        const requirements = {
          ...analyzeRes.data,
          complexity: selectedComplexity,
        };

        set({ progress: 15 });

        // Step 2: Plan
        const planRes = await axios.post(
          `${API_URL}/api/plan`,
          { requirements },
          { timeout: 60000 }
        );
        const plan = planRes.data;

        set({ progress: 25 });

        // Step 3: Generate via SSE stream
        const abortController = new AbortController();
        activeAbortController = abortController;

        const response = await fetch(`${API_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, requirements, plan }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({ error: 'Generation request failed' }));
          throw new Error(errorBody.error || `Server error ${response.status}`);
        }

        const reader = response.body!.getReader();

        await parseSSEStream(reader, (evt) => {
          try {
            const data = JSON.parse(evt.data);

            switch (evt.event) {
              case 'status':
                set({ progress: data.progress ?? get().progress });
                break;

              case 'generation_plan':
                set({ generationPlan: data as GenerationPlan });
                break;

              case 'file_chunk': {
                // Accumulate deltas client-side
                const currentState = get();
                const isSameFile = currentState.streamingFile === data.path;
                set({
                  streamingFile: data.path,
                  streamingContent: (isSameFile ? currentState.streamingContent : '') + data.chunk,
                });
                break;
              }

              case 'file_generated':
                set((state) => ({
                  files: { ...state.files, [data.path]: data.content },
                  validationResults: {
                    ...state.validationResults,
                    [data.path]: data.validation || { is_valid: true, errors: [], warnings: [], fixes_applied: [] }
                  },
                  streamingFile: state.streamingFile === data.path ? null : state.streamingFile,
                  streamingContent: state.streamingFile === data.path ? '' : state.streamingContent,
                }));
                break;

              case 'file_fixing':
                set((state) => ({
                  fixingFiles: {
                    ...state.fixingFiles,
                    [data.path]: { attempt: data.attempt, totalAttempts: data.totalAttempts, errors: data.errors || [] }
                  }
                }));
                break;

              case 'file_fixed':
                set((state) => {
                  const { [data.path]: _, ...remainingFixing } = state.fixingFiles;
                  return {
                    files: { ...state.files, [data.path]: data.content },
                    validationResults: {
                      ...state.validationResults,
                      [data.path]: data.validation || { is_valid: true, errors: [], warnings: [], fixes_applied: [] }
                    },
                    fixingFiles: remainingFixing,
                  };
                });
                break;

              case 'file_error':
                set((state) => ({
                  fileErrors: {
                    ...state.fileErrors,
                    [data.path]: { path: data.path, error: data.error, attempts: data.attempts || 0 }
                  }
                }));
                console.error(`File generation error for ${data.path}:`, data.error);
                break;

              case 'generation_complete':
                set({
                  isGenerating: false,
                  progress: 100,
                  metrics: data.metrics || null,
                  streamingFile: null,
                  streamingContent: '',
                  fixingFiles: {},
                });
                if (data.error) {
                  set({ error: { code: data.error.code, message: data.error.message, details: data.error.details } });
                } else {
                  set({ error: null });
                  console.log('Download URL:', API_URL + data.downloadUrl);
                }
                break;

              case 'generation_error':
                set({
                  isGenerating: false,
                  error: { code: 'GENERATION_ERROR', message: data.error || 'Generation failed', details: { stack: data.details } },
                  streamingFile: null,
                  streamingContent: '',
                });
                break;
            }
          } catch (parseErr) {
            console.error('Failed to parse SSE event:', evt, parseErr);
          }
        }, abortController.signal);

        // If stream ended without a generation_complete event, mark as done
        if (get().isGenerating) {
          set({ isGenerating: false });
        }

      } catch (error: any) {
        // AbortError means user cancelled — don't show error
        if (error?.name === 'AbortError') return;

        console.error('Generation error:', error);

        let errorMessage = 'Failed to start generation.';
        let errorCode = 'NETWORK_ERROR';

        if (error?.code === 'ERR_NETWORK' || error?.message?.includes('Network Error')) {
          errorMessage = 'Cannot connect to backend server. Please ensure the server is running on http://localhost:5001';
        } else if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
          errorMessage = 'Request timed out. The backend server may be overloaded.';
          errorCode = 'TIMEOUT_ERROR';
        } else if (error?.response?.data?.error) {
          errorMessage = typeof error.response.data.error === 'string' ? error.response.data.error : error.response.data.error.message || errorMessage;
          errorCode = error.response.data.error.code || errorCode;
        } else if (error?.message) {
          errorMessage = error.message;
        }

        set({
          isGenerating: false,
          error: {
            code: errorCode,
            message: errorMessage,
            details: error?.response?.data?.error?.details || { originalError: String(error) }
          }
        });
      } finally {
        activeAbortController = null;
      }
    },

    clearError: () => set({ error: null }),

    retryGeneration: async (prompt: string) => {
      const { generateProject } = get();
      await generateProject(prompt);
    },

    saveFileEdit: (path: string, content: string) => {
      set((state) => ({ editedFiles: { ...state.editedFiles, [path]: content } }));
    },

    revertFileEdit: (path: string) => {
      set((state) => {
        const { [path]: _, ...rest } = state.editedFiles;
        return { editedFiles: rest };
      });
    },

    getFileContent: (path: string) => {
      const state = get();
      // If this file is currently streaming, show the streaming content
      if (state.streamingFile === path && state.streamingContent) {
        return state.streamingContent;
      }
      return state.editedFiles[path] ?? state.files[path] ?? '';
    },

    hasUnsavedChanges: () => Object.keys(get().editedFiles).length > 0,

    clearEdits: () => set({ editedFiles: {} }),

    loadProject: (files: Record<string, string>, editedFiles?: Record<string, string>, prompt?: string) => {
      set({
        files: { ...files },
        editedFiles: editedFiles ? { ...editedFiles } : {},
        currentPrompt: prompt || '',
        isGenerating: false,
        progress: 100,
        error: null,
        fileErrors: {},
        validationResults: {},
        metrics: null,
        streamingFile: null,
        streamingContent: '',
        generationPlan: null,
        fixingFiles: {},
      });
    },

    resetProject: () => {
      set({
        files: {},
        editedFiles: {},
        isGenerating: false,
        progress: 0,
        error: null,
        fileErrors: {},
        validationResults: {},
        metrics: null,
        currentPrompt: '',
        streamingFile: null,
        streamingContent: '',
        generationPlan: null,
        fixingFiles: {},
      });
    },

    cancelGeneration: () => {
      // Abort the SSE fetch — backend detects the closed connection
      if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
      }
      set({
        isGenerating: false,
        streamingFile: null,
        streamingContent: '',
      });
    },

    setSelectedFramework: (framework: string) => set({ selectedFramework: framework }),
    setSelectedStyling: (styling: string) => set({ selectedStyling: styling }),
    setSelectedComplexity: (complexity: string) => set({ selectedComplexity: complexity }),
  };
});

// Run initial health check
GenerationStore.getState().checkHealth();
