import { Loader2, X } from 'lucide-react';
import type { PlannedFile } from '../types';

export interface GenerationProgressProps {
  isGenerating: boolean;
  progress: number;
  planFiles: PlannedFile[];
  files: Record<string, string>;
  streamingFile: string | null;
  onCancel: () => void;
}

export default function GenerationProgress({
  isGenerating,
  progress,
  planFiles,
  files,
  streamingFile,
  onCancel,
}: GenerationProgressProps) {
  if (!isGenerating) return null;

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
