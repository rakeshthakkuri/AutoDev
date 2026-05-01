import { Loader2, X, AlertTriangle, RefreshCw } from 'lucide-react';
import type { PlannedFile } from '../types';
import type { ProviderRetryStatus } from '../store/generation';

export interface GenerationProgressProps {
  isGenerating: boolean;
  progress: number;
  planFiles: PlannedFile[];
  files: Record<string, string>;
  streamingFile: string | null;
  onCancel: () => void;
  providerRetry?: ProviderRetryStatus | null;
  generationDegraded?: { provider: string; message: string } | null;
}

export default function GenerationProgress({
  isGenerating,
  progress,
  planFiles,
  files,
  streamingFile,
  onCancel,
  providerRetry,
  generationDegraded,
}: GenerationProgressProps) {
  if (!isGenerating) return null;

  const retrySeconds = providerRetry ? Math.max(1, Math.round(providerRetry.delayMs / 1000)) : 0;

  return (
    <div className="panel-section" aria-live="polite">
      <div className="progress-modern">
        <div className="progress-header">
          <span>
            <Loader2 size={13} className="spin" /> Generating
          </span>
          <span className="progress-percentage">{progress}%</span>
        </div>
        <div className="progress-bar-container">
          <div className="progress-bar-modern" style={{ width: `${progress}%` }} />
        </div>
        <div className="progress-steps">
          <div className={`progress-step ${progress > 0 ? 'active' : ''}`}>
            <div className="step-indicator" />
            <span>Analyzing</span>
          </div>
          <div className={`progress-step ${progress > 20 ? 'active' : ''}`}>
            <div className="step-indicator" />
            <span>Planning</span>
          </div>
          <div className={`progress-step ${progress > 30 ? 'active' : ''}`}>
            <div className="step-indicator" />
            <span>Generating</span>
          </div>
        </div>

        {providerRetry ? (
          <div
            role="status"
            style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 6,
              background: 'rgba(255, 184, 0, 0.08)',
              border: '1px solid rgba(255, 184, 0, 0.25)',
              color: '#a36b00',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            <RefreshCw size={14} className="spin" />
            <span>
              Provider <strong>{providerRetry.provider}</strong> is busy — retrying in {retrySeconds}s
              (attempt {providerRetry.attempt}/{providerRetry.maxAttempts}).
            </span>
          </div>
        ) : null}

        {generationDegraded ? (
          <div
            role="status"
            style={{
              marginTop: 8,
              padding: '8px 12px',
              borderRadius: 6,
              background: 'rgba(220, 100, 0, 0.08)',
              border: '1px solid rgba(220, 100, 0, 0.25)',
              color: '#8a3a00',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            <AlertTriangle size={14} />
            <span>{generationDegraded.message}</span>
          </div>
        ) : null}

        <div className="cancel-container">
          <button type="button" className="cancel-btn" onClick={onCancel} aria-label="Cancel generation">
            <X size={12} />
            Cancel
          </button>
        </div>

        {planFiles.length > 0 && (
          <div className="planned-files">
            <div className="planned-files-label">Planned files:</div>
            {planFiles.map((f, i) => {
              const isGenerated = f.path in files;
              const isStreamingThis = streamingFile === f.path;
              return (
                <div
                  key={i}
                  className={`planned-file ${isGenerated ? 'generated' : ''} ${isStreamingThis ? 'streaming' : ''}`}
                >
                  <span className="planned-file-status">
                    {isGenerated ? '✓' : isStreamingThis ? '…' : '○'}
                  </span>
                  <span className="planned-file-path">{f.path}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
