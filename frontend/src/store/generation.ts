import { create } from 'zustand';
import toast from 'react-hot-toast';
import type {
  ErrorDetails,
  FileError,
  ValidationResult,
  GenerationPlan,
  CurrentPhase,
  FixingFileState,
  GenerationMetrics,
} from '../types';
import { getHealth, analyzePrompt, getPlan, generateProjectStream, API_URL } from '../services/api';

// ─── Generation state (Zustand store shape) ───────────────────────────────────

interface GenerationState {
  files: Record<string, string>;
  editedFiles: Record<string, string>;
  isGenerating: boolean;
  progress: number;
  error: ErrorDetails | null;
  backendConnected: boolean;
  fileErrors: Record<string, FileError>;
  validationResults: Record<string, ValidationResult>;
  metrics: GenerationMetrics | null;
  currentPrompt: string;
  streamingFile: string | null;
  streamingContent: string;
  generationPlan: GenerationPlan | null;
  /** Shown when analyze used fallback (e.g. could not parse AI response). */
  analysisFallbackWarning: string | null;
  /** Shown when plan used fallback (e.g. default file list). */
  planFallbackWarning: string | null;
  fixingFiles: Record<string, FixingFileState>;
  currentPhase: CurrentPhase;
  currentFile: string | null;
  selectedFramework: string;
  selectedStyling: string;
  selectedComplexity: string;
  generateProject: (prompt: string) => Promise<void>;
  clearError: () => void;
  retryGeneration: (prompt: string) => Promise<void>;
  saveFileEdit: (path: string, content: string) => void;
  revertFileEdit: (path: string) => void;
  getFileContent: (path: string) => string;
  hasUnsavedChanges: () => boolean;
  /** Returns true if no unsaved changes or user confirmed discard. Use before load/reset/generate. */
  confirmDiscardChanges: (message?: string) => boolean;
  clearEdits: () => void;
  loadProject: (files: Record<string, string>, editedFiles?: Record<string, string>, prompt?: string) => void;
  resetProject: () => void;
  cancelGeneration: () => void;
  checkHealth: () => Promise<void>;
  setSelectedFramework: (framework: string) => void;
  setSelectedStyling: (styling: string) => void;
  setSelectedComplexity: (complexity: string) => void;
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
    analysisFallbackWarning: null,
    planFallbackWarning: null,
    fixingFiles: {},
    currentPhase: 'complete',
    currentFile: null,
    selectedFramework: 'auto',
    selectedStyling: 'auto',
    selectedComplexity: 'simple',

    checkHealth: async () => {
      try {
        const ok = await getHealth();
        set({ backendConnected: ok });
      } catch {
        set({ backendConnected: false });
      }
    },

    generateProject: async (prompt: string) => {
      const { confirmDiscardChanges, selectedFramework, selectedStyling, selectedComplexity } = get();

      if (!confirmDiscardChanges('You have unsaved changes. Regenerating will discard all edits. Continue?')) return;

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
        analysisFallbackWarning: null,
        planFallbackWarning: null,
        fixingFiles: {},
      });

      const abortController = new AbortController();
      activeAbortController = abortController;
      const signal = abortController.signal;

      try {
        const ok = await getHealth(signal);
        if (!ok) {
          set({ backendConnected: false });
          throw new Error(`Backend server is not responding. Please ensure the server is reachable at ${API_URL}.`);
        }
        set({ backendConnected: true });

        const analyzeRes = await analyzePrompt(
          { prompt, framework: selectedFramework, styling: selectedStyling },
          { signal }
        );
        const sessionId = analyzeRes.sessionId;
        const { sessionId: _sid, ...analyzePayload } = analyzeRes;
        const requirements = { ...analyzePayload, complexity: selectedComplexity };
        const analysisWarning =
          analyzeRes.usedFallback && analyzeRes.warning ? analyzeRes.warning : null;
        set({ progress: 15, currentPhase: 'planning', analysisFallbackWarning: analysisWarning });

        const plan = await getPlan({ requirements }, { signal });
        const planWarning = plan.usedFallback && plan.warning ? plan.warning : null;
        set({ progress: 25, currentPhase: 'generating', planFallbackWarning: planWarning });

        await generateProjectStream(
          { prompt, requirements, plan },
          {
            sessionId,
            signal,
            onEvent: (eventName, data) => {
              try {
                const d = data as Record<string, unknown>;
                if ((eventName as string) === 'cancelation' || (d && (d as { type?: string }).type === 'cancelation')) return;

                switch (eventName) {
              case 'status':
                set((state) => ({
                  progress: (d.progress as number) ?? state.progress,
                  currentFile: (d.currentFile as string) ?? state.currentFile,
                }));
                break;

              case 'generation_plan':
                set({ generationPlan: d as unknown as GenerationPlan });
                break;

              case 'file_chunk':
                set((state) => ({
                  streamingFile: d.path as string,
                  streamingContent: (state.streamingFile === d.path ? state.streamingContent : '') + (d.chunk as string),
                }));
                break;

              case 'file_generated': {
                const validation = (d.validation as ValidationResult) || { is_valid: true, errors: [], warnings: [], fixes_applied: [] };
                if (d.fallback) {
                  (validation as ValidationResult).fallback = true;
                  (validation as ValidationResult).fallbackReason = (d.fallbackReason as string) || 'Template fallback used';
                }
                set((state) => ({
                  files: { ...state.files, [d.path as string]: d.content as string },
                  validationResults: { ...state.validationResults, [d.path as string]: validation },
                  streamingFile: state.streamingFile === d.path ? null : state.streamingFile,
                  streamingContent: state.streamingFile === d.path ? '' : state.streamingContent,
                }));
                break;
              }

              case 'file_fixing':
                set((state) => ({
                  fixingFiles: {
                    ...state.fixingFiles,
                    [d.path as string]: { attempt: d.attempt as number, totalAttempts: d.totalAttempts as number, errors: (d.errors as string[]) || [] }
                  }
                }));
                break;

              case 'file_fixed':
                set((state) => {
                  const pathKey = d.path as string;
                  const { [pathKey]: _, ...remainingFixing } = state.fixingFiles;
                  return {
                    files: { ...state.files, [pathKey]: d.content as string },
                    validationResults: {
                      ...state.validationResults,
                      [pathKey]: (d.validation as ValidationResult) || { is_valid: true, errors: [], warnings: [], fixes_applied: [] }
                    },
                    fixingFiles: remainingFixing,
                  };
                });
                break;

              case 'file_error':
                set((state) => ({
                  fileErrors: {
                    ...state.fileErrors,
                    [d.path as string]: { path: d.path as string, error: d.error as string, attempts: (d.attempts as number) || 0 }
                  }
                }));
                console.error(`File generation error for ${d.path}:`, d.error);
                break;

              case 'generation_complete':
                set({
                  isGenerating: false,
                  progress: 100,
                  currentPhase: 'complete',
                  currentFile: null,
                  metrics: (d.metrics as GenerationMetrics) || null,
                  streamingFile: null,
                  streamingContent: '',
                  fixingFiles: {},
                });
                if (d.error) {
                  const err = d.error as Record<string, unknown>;
                  set({ error: { code: err.code as string, message: err.message as string, details: err.details as Record<string, unknown> } });
                } else {
                  set({ error: null });
                }
                break;

              case 'generation_error':
                set({
                  isGenerating: false,
                  currentPhase: 'complete',
                  currentFile: null,
                  error: {
                    code: 'GENERATION_ERROR',
                    message: (d.error as string) || 'Generation failed',
                    details: {
                      stack: d.details,
                      filesGenerated: d.filesGenerated,
                      partialSuccess: d.partialSuccess,
                    },
                  },
                  streamingFile: null,
                  streamingContent: '',
                });
                break;
            }
          } catch (parseErr) {
            console.error('Failed to parse SSE event:', eventName, parseErr);
          }
        }
        } ).catch((err: unknown) => {
          if (err && typeof err === 'object' && (err as { type?: string }).type === 'cancelation') return;
          throw err;
        });

        if (get().isGenerating) {
          set({ isGenerating: false, currentPhase: 'complete', currentFile: null });
        }

      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (typeof error === 'object' && error !== null && (error as { type?: string }).type === 'cancelation') return;

        console.error('Generation error:', error);

        let errorMessage = 'Failed to start generation.';
        let errorCode = 'NETWORK_ERROR';

        if (error instanceof Error) {
          if (error.message?.includes('Network Error') || error.message?.includes('fetch')) {
            errorMessage = `Cannot connect to backend server. Please ensure the server is reachable at ${API_URL}.`;
          } else if (error.message?.includes('timeout') || error.name === 'AbortError') {
            errorMessage = 'Request timed out. The backend server may be overloaded.';
            errorCode = 'TIMEOUT_ERROR';
          } else {
            errorMessage = error.message;
          }
        }

        set({
          isGenerating: false,
          error: {
            code: errorCode,
            message: errorMessage,
            details: { originalError: String(error) }
          }
        });
        toast.error(errorMessage);
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

    confirmDiscardChanges: (message = 'You have unsaved changes. Discard them?') => {
      if (Object.keys(get().editedFiles).length === 0) return true;
      return window.confirm(message);
    },

    clearEdits: () => set({ editedFiles: {} }),

    loadProject: (files: Record<string, string>, editedFiles?: Record<string, string>, prompt?: string) => {
      set({
        files: { ...files },
        editedFiles: editedFiles ? { ...editedFiles } : {},
        currentPrompt: prompt || '',
        isGenerating: false,
        progress: 100,
        currentPhase: 'complete',
        currentFile: null,
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
        currentPhase: 'complete',
        currentFile: null,
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
      if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
      }
      set({
        isGenerating: false,
        currentPhase: 'complete',
        currentFile: null,
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
