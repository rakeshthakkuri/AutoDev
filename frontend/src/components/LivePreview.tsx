import { useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw, ExternalLink, Smartphone, Tablet, Monitor, Eye, Terminal, Loader2 } from 'lucide-react';
import { GenerationStore } from '../store/generation';
import { bundleProject, detectProjectType, ProjectType, clearCache } from '../services/bundler';

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const FRAMEWORK_LABELS: Record<string, string> = {
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  nextjs: 'Next.js',
  angular: 'Angular',
  astro: 'Astro',
  html: 'HTML',
  unknown: 'Unknown',
};

const SERVER_FRAMEWORKS = ['nextjs', 'angular', 'astro'];

interface LivePreviewProps {
  files: Record<string, string>;
}

type DeviceFrame = 'mobile' | 'tablet' | 'desktop' | 'none';

export default function LivePreview({ files }: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [projectType, setProjectType] = useState<ProjectType>('unknown');
  const [deviceFrame, setDeviceFrame] = useState<DeviceFrame>('none');
  const [responsiveWidth, setResponsiveWidth] = useState(100);
  const [bundlerErrors, setBundlerErrors] = useState<string[]>([]);
  const [bundlerWarnings, setBundlerWarnings] = useState<string[]>([]);
  const [showDevInstructions, setShowDevInstructions] = useState(false);
  const { editedFiles, getFileContent, generationPlan } = GenerationStore();

  const getContent = useCallback((path: string) => getFileContent(path), [getFileContent]);

  const getAllFiles = useCallback((): Record<string, string> => {
    const allFiles: Record<string, string> = {};
    for (const path of Object.keys(files)) {
      allFiles[path] = getContent(path);
    }
    for (const path of Object.keys(editedFiles)) {
      if (!allFiles[path]) allFiles[path] = editedFiles[path];
    }
    return allFiles;
  }, [files, editedFiles, getContent]);

  const renderPreview = useCallback(async () => {
    if (!iframeRef.current) return;
    setIsLoading(true);
    setError(null);
    setBundlerErrors([]);
    setBundlerWarnings([]);

    try {
      const allFiles = getAllFiles();
      if (!allFiles || Object.keys(allFiles).length === 0) {
        setError('No files available');
        setIsLoading(false);
        return;
      }

      const detectedType = detectProjectType(allFiles);
      setProjectType(detectedType);

      const bundled = bundleProject(allFiles);
      setBundlerErrors(bundled.errors);
      setBundlerWarnings(bundled.warnings);

      if (bundled.errors.length > 0 && !bundled.html) {
        setError(`Bundling failed: ${bundled.errors.join(', ')}`);
        setIsLoading(false);
        return;
      }

      if (!bundled.html) {
        const iframe = iframeRef.current;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(`<html><body style="font-family:sans-serif;padding:2rem;color:#666;text-align:center">
            <h2>Preview Unavailable</h2>
            <p>No renderable content found. Generated files:</p>
            <div style="margin-top:1rem;padding:1rem;background:#f5f5f5;border-radius:8px;text-align:left">
              ${Object.keys(allFiles).map(f => `<div style="margin:.25rem 0">${escapeHtml(f)}</div>`).join('')}
            </div>
          </body></html>`);
          doc.close();
        }
        setIsLoading(false);
        return;
      }

      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc && bundled.html) {
        try {
          doc.open();
          doc.write(bundled.html);
          doc.close();
          setError(null);
        } catch (writeErr) {
          const msg = writeErr instanceof Error ? writeErr.message : 'Failed to render preview';
          doc.open();
          doc.write(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:1.5rem;color:#333"><h2 style="color:#c00">Preview Error</h2><p>${escapeHtml(msg)}</p></body></html>`);
          doc.close();
          setError(msg);
        }
      }
    } catch (err) {
      console.error('Preview error:', err);
      setError(err instanceof Error ? err.message : 'Error loading preview');
    } finally {
      setIsLoading(false);
    }
  }, [getAllFiles]);

  useEffect(() => { renderPreview(); }, [renderPreview]);

  const handleRefresh = () => { clearCache(); renderPreview(); };

  const handleOpenInNewTab = () => {
    const allFiles = getAllFiles();
    const bundled = bundleProject(allFiles);
    if (bundled.html) {
      const newWindow = window.open();
      if (newWindow) { newWindow.document.write(bundled.html); newWindow.document.close(); }
    }
  };

  const isServerFramework = SERVER_FRAMEWORKS.includes(projectType);
  const detectedFramework = generationPlan?.framework || projectType;

  const getIframeClassName = (): string => {
    switch (deviceFrame) {
      case 'mobile': return 'device-frame-mobile';
      case 'tablet': return 'device-frame-tablet';
      case 'desktop': return 'device-frame-desktop';
      default: return '';
    }
  };

  const getIframeStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = { width: '100%', height: '100%', border: 'none' };
    if (deviceFrame === 'mobile') return { ...base, maxWidth: `${375 * (responsiveWidth / 100)}px` };
    if (deviceFrame === 'tablet') return { ...base, maxWidth: `${768 * (responsiveWidth / 100)}px` };
    if (deviceFrame === 'desktop') return { ...base, maxWidth: `${responsiveWidth}%` };
    return base;
  };

  const getDevInstructions = () => {
    const fw = detectedFramework;
    if (fw === 'nextjs') return 'cd project && npm install && npm run dev';
    if (fw === 'angular') return 'cd project && npm install && ng serve';
    if (fw === 'astro') return 'cd project && npm install && npm run dev';
    if (fw === 'vue') return 'cd project && npm install && npm run dev';
    if (fw === 'svelte') return 'cd project && npm install && npm run dev';
    if (fw === 'react' || fw === 'react-ts') return 'cd project && npm install && npm run dev';
    return 'Open index.html in your browser';
  };

  return (
    <div className="live-preview">
      <div className="preview-header">
        <div className="preview-header-left">
          <Eye size={14} />
          <span>Preview</span>
          {projectType !== 'unknown' && (
            <span className={`project-type-badge badge-${projectType}`}>
              {FRAMEWORK_LABELS[projectType] || projectType}
            </span>
          )}
          {isLoading && <span className="loading-indicator">Bundling...</span>}
        </div>
        <div className="preview-controls">
          <div className="device-frame-controls" role="group" aria-label="Device preview size">
            <button onClick={() => setDeviceFrame(deviceFrame === 'mobile' ? 'none' : 'mobile')} className={deviceFrame === 'mobile' ? 'active' : ''} title="Mobile (375px)" aria-label="Toggle mobile preview" aria-pressed={deviceFrame === 'mobile'}>
              <Smartphone size={13} />
            </button>
            <button onClick={() => setDeviceFrame(deviceFrame === 'tablet' ? 'none' : 'tablet')} className={deviceFrame === 'tablet' ? 'active' : ''} title="Tablet (768px)" aria-label="Toggle tablet preview" aria-pressed={deviceFrame === 'tablet'}>
              <Tablet size={13} />
            </button>
            <button onClick={() => setDeviceFrame(deviceFrame === 'desktop' ? 'none' : 'desktop')} className={deviceFrame === 'desktop' ? 'active' : ''} title="Desktop" aria-label="Toggle desktop preview" aria-pressed={deviceFrame === 'desktop'}>
              <Monitor size={13} />
            </button>
          </div>

          {deviceFrame !== 'none' && (
            <div className="responsive-width-control">
              <input type="range" min="50" max="100" value={responsiveWidth} onChange={(e) => setResponsiveWidth(Number(e.target.value))} title={`${responsiveWidth}%`} />
              <span className="width-label">{responsiveWidth}%</span>
            </div>
          )}

          <button onClick={handleRefresh} title="Refresh preview" aria-label="Refresh preview"><RefreshCw size={13} /></button>
          <button onClick={handleOpenInNewTab} title="Open in new tab" aria-label="Open preview in new tab"><ExternalLink size={13} /></button>
        </div>
      </div>

      {/* Server framework notice */}
      {isServerFramework && (
        <div className="server-framework-banner">
          <div className="banner-content">
            <Terminal size={13} />
            <span>This {FRAMEWORK_LABELS[projectType]} project requires a dev server for full interactivity.</span>
            <button className="banner-toggle" onClick={() => setShowDevInstructions(!showDevInstructions)}>
              {showDevInstructions ? 'Hide' : 'Run locally'}
            </button>
          </div>
          {showDevInstructions && (
            <div className="dev-instructions">
              <p>Download the project and run:</p>
              <code>{getDevInstructions()}</code>
            </div>
          )}
        </div>
      )}

      {/* Errors */}
      {(error || bundlerErrors.length > 0) && (
        <div className="preview-errors" role="alert" aria-live="assertive">
          {error && <div className="error-message">{error}</div>}
          {bundlerErrors.map((err, i) => <div key={i} className="error-message">{err}</div>)}
        </div>
      )}

      {/* Warnings */}
      {bundlerWarnings.length > 0 && (
        <div className="preview-warnings">
          {bundlerWarnings.map((warn, i) => <div key={i} className="warning-message">{warn}</div>)}
        </div>
      )}

      <div className={`preview-container ${deviceFrame !== 'none' ? 'device-active' : ''}`}>
        {isLoading && (
          <div className="preview-skeleton-overlay">
            <Loader2 size={20} className="spin" />
            <span>Bundling preview...</span>
          </div>
        )}
        <iframe
          ref={iframeRef}
          title="preview"
          sandbox="allow-scripts allow-same-origin"
          className={getIframeClassName()}
          style={getIframeStyle()}
        />
      </div>
    </div>
  );
}
