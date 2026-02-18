import { create } from 'zustand';
import io from 'socket.io-client';
import axios from 'axios';

// In dev, use same origin so Vite proxy forwards to backend (5001). In prod, use env or default.
const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5001');
const socket = io(API_URL || undefined);

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
  streamingContent: string;           // Accumulated streaming content
  generationPlan: GenerationPlan | null;  // Plan received before generation

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
  setSelectedFramework: (framework: string) => void;
  setSelectedStyling: (styling: string) => void;
  setSelectedComplexity: (complexity: string) => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const GenerationStore = create<GenerationState>((set, get) => {
  // ── Socket connection tracking
  set({ backendConnected: socket.connected });
  socket.on('connect', () => set({ backendConnected: true }));
  socket.on('disconnect', () => set({ backendConnected: false }));
  socket.on('connect_error', () => set({ backendConnected: false }));

  // ── Progress updates
  socket.on('status', (data) => {
    set({ progress: data.progress ?? get().progress });
  });

  // ── Generation plan (received before files start generating)
  socket.on('generation_plan', (data: GenerationPlan) => {
    set({ generationPlan: data });
  });

  // ── Streaming: receive code chunks as they're generated
  socket.on('file_chunk', (data: { path: string; chunk: string; accumulated: string }) => {
    set({
      streamingFile: data.path,
      streamingContent: data.accumulated,
    });
  });

  // ── File fully generated
  socket.on('file_generated', (data) => {
    set((state) => ({
      files: { ...state.files, [data.path]: data.content },
      validationResults: {
        ...state.validationResults,
        [data.path]: data.validation || { is_valid: true, errors: [], warnings: [], fixes_applied: [] }
      },
      // Clear streaming state for this file
      streamingFile: state.streamingFile === data.path ? null : state.streamingFile,
      streamingContent: state.streamingFile === data.path ? '' : state.streamingContent,
    }));
  });

  // ── File validation update
  socket.on('file_validated', (data) => {
    set((state) => ({
      validationResults: {
        ...state.validationResults,
        [data.path]: {
          is_valid: data.is_valid,
          errors: data.errors || [],
          warnings: data.warnings || [],
          fixes_applied: data.fixes_applied || []
        }
      }
    }));
  });

  // ── File error
  socket.on('file_error', (data) => {
    set((state) => ({
      fileErrors: {
        ...state.fileErrors,
        [data.path]: { path: data.path, error: data.error, attempts: data.attempts || 0 }
      }
    }));
    console.error(`File generation error for ${data.path}:`, data.error);
  });

  // ── Generation complete
  socket.on('generation_complete', (data) => {
    set({
      isGenerating: false,
      progress: 100,
      metrics: data.metrics || null,
      streamingFile: null,
      streamingContent: '',
    });

    if (data.error) {
      set({ error: { code: data.error.code, message: data.error.message, details: data.error.details } });
    } else {
      set({ error: null });
      console.log('Download URL:', API_URL + data.downloadUrl);
    }
  });

  // ── Generation error (fatal)
  socket.on('generation_error', (data) => {
    set({
      isGenerating: false,
      error: { code: 'GENERATION_ERROR', message: data.error || 'Generation failed', details: { stack: data.details } },
      streamingFile: null,
      streamingContent: '',
    });
  });

  // ─── Return initial state + actions ────────────────────────────────────────
  return {
    files: {},
    editedFiles: {},
    isGenerating: false,
    progress: 0,
    error: null,
    backendConnected: socket.connected,
    fileErrors: {},
    validationResults: {},
    metrics: null,
    currentPrompt: '',
    streamingFile: null,
    streamingContent: '',
    generationPlan: null,
    selectedFramework: 'auto',
    selectedStyling: 'auto',
    selectedComplexity: 'simple',

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
      });

      try {
        // Health check
        try {
          await axios.get(`${API_URL}/health`, { timeout: 5000 });
        } catch (healthError: any) {
          throw new Error('Backend server is not responding. Please ensure the server is running on port 5001.');
        }

        // Step 1: Analyze (pass framework/styling preferences)
        const analyzeRes = await axios.post(
          `${API_URL}/api/analyze`,
          {
            prompt,
            framework: selectedFramework,
            styling: selectedStyling,
          },
          { timeout: 60000 }
        );
        const requirements = {
          ...analyzeRes.data,
          // Override complexity from user selection
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

        // Step 3: Generate via WebSocket (streaming)
        socket.emit('generate_project', { prompt, requirements, plan });

      } catch (error: any) {
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
      });
    },

    cancelGeneration: () => {
      socket.emit('cancel_generation');
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
