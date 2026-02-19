import type { AnalyzeRequest, AnalyzeResponse, PlanRequest, PlanResponse, GenerateRequest, SSEEventType, BundleRequest, BundledProject, ZipRequest } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const defaultTimeout = 60000;

// ─── Health ──────────────────────────────────────────────────────────────────

export async function getHealth(signal?: AbortSignal): Promise<boolean> {
  const res = await fetch(`${API_URL}/health`, { method: 'GET', signal: signal ?? AbortSignal.timeout(3000) });
  return res.ok;
}

// ─── Analyze ──────────────────────────────────────────────────────────────────

export async function analyzePrompt(
  payload: AnalyzeRequest,
  options?: { timeout?: number; signal?: AbortSignal }
): Promise<AnalyzeResponse> {
  const timeout = options?.timeout ?? defaultTimeout;
  // Combine timeout signal with the optional caller signal so both can abort
  const signals = [AbortSignal.timeout(timeout)];
  if (options?.signal) signals.push(options.signal);
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];

  const res = await fetch(`${API_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Analysis failed: ${res.status}`);
  }
  return res.json();
}

// ─── Plan ──────────────────────────────────────────────────────────────────────

export async function getPlan(
  payload: PlanRequest,
  options?: { timeout?: number; signal?: AbortSignal }
): Promise<PlanResponse> {
  const timeout = options?.timeout ?? defaultTimeout;
  const signals = [AbortSignal.timeout(timeout)];
  if (options?.signal) signals.push(options.signal);
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];

  const res = await fetch(`${API_URL}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Planning failed: ${res.status}`);
  }
  return res.json();
}

// ─── Generate (SSE) ───────────────────────────────────────────────────────────

/**
 * Parse SSE stream and call onEvent for each event.
 * Resolves when stream ends; rejects on non-2xx or network error.
 */
async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: string, data: unknown) => void,
  signal?: AbortSignal
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        if (!part.trim()) continue;

        let eventName = '';
        let eventData = '';

        for (const line of part.split('\n')) {
          if (line.startsWith('event: ')) eventName = line.slice(7);
          else if (line.startsWith('data: ')) eventData = line.slice(6);
        }

        if (eventName && eventData) {
          try {
            const parsed = JSON.parse(eventData) as unknown;
            onEvent(eventName, parsed);
          } catch {
            onEvent(eventName, eventData);
          }
        }
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') throw err;
  }
}

export interface GenerateStreamOptions {
  sessionId?: string;
  signal?: AbortSignal;
  onEvent: (event: SSEEventType, data: unknown) => void;
}

/**
 * Start generation SSE stream. Calls onEvent for each server-sent event.
 * Resolves when stream ends; rejects on non-2xx or network error.
 */
export async function generateProjectStream(
  body: GenerateRequest,
  options: GenerateStreamOptions
): Promise<void> {
  const { sessionId, signal, onEvent } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionId) headers['X-Session-Id'] = sessionId;

  const res = await fetch(`${API_URL}/api/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: 'Generation request failed' }));
    throw new Error(
      typeof errorBody.error === 'string' ? errorBody.error : (errorBody.error?.message ?? `Server error ${res.status}`)
    );
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  await parseSSEStream(reader, (eventName, data) => onEvent(eventName as SSEEventType, data), signal);
}

// ─── Bundle ───────────────────────────────────────────────────────────────────

export async function bundleProject(
  payload: BundleRequest,
  options?: { timeout?: number; signal?: AbortSignal }
): Promise<BundledProject> {
  const timeout = options?.timeout ?? defaultTimeout;
  const signals = [AbortSignal.timeout(timeout)];
  if (options?.signal) signals.push(options.signal);
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];

  const res = await fetch(`${API_URL}/api/bundle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Bundling failed: ${res.status}`);
  }
  return res.json();
}

// ─── Download ─────────────────────────────────────────────────────────────────

export async function downloadZip(
  payload: ZipRequest,
  options?: { timeout?: number; signal?: AbortSignal }
): Promise<Blob> {
  const timeout = options?.timeout ?? defaultTimeout;
  const signals = [AbortSignal.timeout(timeout)];
  if (options?.signal) signals.push(options.signal);
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];

  const res = await fetch(`${API_URL}/download/zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `ZIP download failed: ${res.status}`);
  }
  return res.blob();
}

export { API_URL };
