import { create } from 'zustand';
import io from 'socket.io-client';
import axios from 'axios';

const API_URL = 'http://localhost:5001';
const socket = io(API_URL);

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

interface GenerationState {
  files: Record<string, string>;
  editedFiles: Record<string, string>; // Track edited file content
  isGenerating: boolean;
  progress: number;
  error: ErrorDetails | null;
  fileErrors: Record<string, FileError>;
  validationResults: Record<string, {
    is_valid: boolean;
    errors: string[];
    warnings: string[];
    fixes_applied: string[];
  }>;
  metrics: {
    validation?: any;
    retries?: any;
  } | null;
  currentPrompt: string; // Store current prompt for regeneration
  generateProject: (prompt: string) => Promise<void>;
  clearError: () => void;
  retryGeneration: (prompt: string) => Promise<void>;
  saveFileEdit: (path: string, content: string) => void;
  revertFileEdit: (path: string) => void;
  getFileContent: (path: string) => string; // Get content (edited or original)
  hasUnsavedChanges: () => boolean;
  clearEdits: () => void;
  loadProject: (files: Record<string, string>, editedFiles?: Record<string, string>, prompt?: string) => void;
}

export const GenerationStore = create<GenerationState>((set, get) => {
  socket.on('status', (data) => {
    set({ progress: data.progress });
  });

  socket.on('file_generated', (data) => {
    set((state) => ({
      files: { ...state.files, [data.path]: data.content },
      validationResults: {
        ...state.validationResults,
        [data.path]: data.validation || { is_valid: true, errors: [], warnings: [], fixes_applied: [] }
      }
    }));
  });

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

  socket.on('file_error', (data) => {
    set((state) => ({
      fileErrors: {
        ...state.fileErrors,
        [data.path]: {
          path: data.path,
          error: data.error,
          attempts: data.attempts
        }
      }
    }));
    console.error(`File generation error for ${data.path}:`, data.error);
  });

  socket.on('generation_complete', (data) => {
    set({ 
      isGenerating: false, 
      progress: 100,
      metrics: data.metrics || null
    });
    
    if (data.error) {
      set({
        error: {
          code: data.error.code,
          message: data.error.message,
          details: data.error.details
        }
      });
    } else {
      set({ error: null });
      console.log('Download URL:', API_URL + data.downloadUrl);
    }
  });

  return {
    files: {},
    editedFiles: {},
    isGenerating: false,
    progress: 0,
    error: null,
    fileErrors: {},
    validationResults: {},
    metrics: null,
    currentPrompt: '',

    generateProject: async (prompt: string) => {
      const { hasUnsavedChanges } = get();
      
      // Check for unsaved changes before regenerating
      if (hasUnsavedChanges()) {
        const confirmed = window.confirm(
          'You have unsaved changes. Regenerating will discard all edits. Continue?'
        );
        if (!confirmed) return;
      }
      
      set({ 
        isGenerating: true, 
        progress: 0, 
        files: {},
        editedFiles: {}, // Clear edits on new generation
        error: null,
        fileErrors: {},
        validationResults: {},
        metrics: null,
        currentPrompt: prompt
      });

      try {
        // Step 1: Analyze
        const analyzeRes = await axios.post(`${API_URL}/api/analyze`, { prompt });
        const requirements = analyzeRes.data;

        // Step 2: Plan
        const planRes = await axios.post(`${API_URL}/api/plan`, { requirements });
        const plan = planRes.data;

        // Step 3: Generate via WebSocket
        socket.emit('generate_project', { prompt, requirements, plan });
      } catch (error: any) {
        console.error('Generation error:', error);
        set({ 
          isGenerating: false,
          error: {
            code: error.response?.data?.error?.code || 'NETWORK_ERROR',
            message: error.response?.data?.error?.message || error.message || 'Failed to start generation',
            details: error.response?.data?.error?.details || {}
          }
        });
      }
    },

    clearError: () => {
      set({ error: null });
    },

    retryGeneration: async (prompt: string) => {
      const { generateProject } = get();
      await generateProject(prompt);
    },

    saveFileEdit: (path: string, content: string) => {
      set((state) => ({
        editedFiles: { ...state.editedFiles, [path]: content }
      }));
    },

    revertFileEdit: (path: string) => {
      set((state) => {
        const { [path]: _, ...rest } = state.editedFiles;
        return { editedFiles: rest };
      });
    },

    getFileContent: (path: string) => {
      const state = get();
      return state.editedFiles[path] ?? state.files[path] ?? '';
    },

    hasUnsavedChanges: () => {
      return Object.keys(get().editedFiles).length > 0;
    },

    clearEdits: () => {
      set({ editedFiles: {} });
    },

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
        metrics: null
      });
    }
  };
});
