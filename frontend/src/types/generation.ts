// ─── API / Store error and validation ────────────────────────────────────────

export interface ErrorDetails {
  code?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface FileError {
  path: string;
  error: string;
  attempts: number;
}

export interface ValidationResult {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  fixes_applied: string[];
  fallback?: boolean;
  fallbackReason?: string;
}

// ─── Plan and project ────────────────────────────────────────────────────────

export interface PlannedFile {
  path: string;
  purpose: string;
}

export interface GenerationPlan {
  files: PlannedFile[];
  techStack: string[];
  framework: string;
  stylingFramework: string;
}

// ─── Health (GET /health) ─────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  version: string;
  agentVersion: string;
  v1Deprecated: boolean;
  v2Available: boolean;
  frameworks: string[];
}

// ─── Generation state (metrics, phase, fixing) ────────────────────────────────

export type CurrentPhase = 'analyzing' | 'planning' | 'generating' | 'reviewing' | 'complete';

export interface FixingFileState {
  attempt: number;
  totalAttempts: number;
  errors: string[];
}

export interface GenerationMetrics {
  duration?: number;
  filesGenerated?: number;
  validation?: unknown;
  retries?: unknown;
}
