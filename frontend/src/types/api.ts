import type { GenerationPlan } from './generation';

// ─── Analyze ──────────────────────────────────────────────────────────────────

export interface AnalyzeRequest {
  prompt: string;
  framework?: string;
  styling?: string;
}

export interface AnalyzeResponse extends Record<string, unknown> {
  sessionId: string;
  projectType?: string;
  features?: string[];
  styling?: string;
  complexity?: string;
  framework?: string;
  stylingFramework?: string;
  colorScheme?: string;
  layout?: string;
  description?: string;
  usedFallback?: boolean;
  warning?: string;
}

// ─── Plan ───────────────────────────────────────────────────────────────────

export interface PlanRequest {
  requirements: Record<string, unknown>;
}

export interface PlanResponse extends GenerationPlan {
  usedFallback?: boolean;
  warning?: string;
}

// ─── Generate (SSE) ──────────────────────────────────────────────────────────

export interface GenerateRequest {
  prompt: string;
  requirements: Record<string, unknown>;
  plan: GenerationPlan;
}

export type SSEEventType =
  | 'status'
  | 'generation_plan'
  | 'file_chunk'
  | 'file_generated'
  | 'file_fixing'
  | 'file_fixed'
  | 'file_error'
  | 'generation_complete'
  | 'generation_error'
  | 'progress'
  | 'complete'
  | 'error';

/** Body returned when POST /api/generate responds with 202 Accepted (async job + progress stream). */
export interface AsyncGenerateResponse {
  jobId: string;
  status: string;
  statusUrl: string;
  streamUrl: string;
}

export interface GenerateStreamCallbacks {
  onEvent: (event: SSEEventType, data: unknown) => void;
}

// ─── Bundle ───────────────────────────────────────────────────────────────────

export type ProjectType = 'react' | 'vue' | 'svelte' | 'nextjs' | 'angular' | 'astro' | 'html' | 'unknown';

export interface BundledProject {
  html: string;
  errors: string[];
  warnings: string[];
  projectType: ProjectType;
}

export interface BundleRequest {
  files: Record<string, string>;
}

export interface ZipRequest {
  files: Record<string, string>;
  filename?: string;
}
