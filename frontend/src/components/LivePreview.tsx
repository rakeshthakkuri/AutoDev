import { useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw, ExternalLink, Smartphone, Tablet, Monitor, Maximize2, Minimize2 } from 'lucide-react';
import { GenerationStore } from '../store/generation';
import { bundleProject, detectProjectType, ProjectType, clearCache } from '../services/bundler';

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
  const { editedFiles, getFileContent } = GenerationStore();

  // Get file content (edited or original)
  const getContent = useCallback((path: string) => {
    return getFileContent(path);
  }, [getFileContent]);

  // Get all files (edited or original)
  const getAllFiles = useCallback((): Record<string, string> => {
    const allFiles: Record<string, string> = {};
    const filePaths = Object.keys(files);
    
    for (const path of filePaths) {
      allFiles[path] = getContent(path);
    }
    
    // Also include any edited files that might not be in the original files
    for (const path of Object.keys(editedFiles)) {
      if (!allFiles[path]) {
        allFiles[path] = editedFiles[path];
      }
    }
    
    return allFiles;
  }, [files, editedFiles, getContent]);

  // Bundle and render project
  const renderPreview = useCallback(async () => {
    if (!iframeRef.current) return;

    setIsLoading(true);
    setError(null);
    setBundlerErrors([]);
    setBundlerWarnings([]);

    try {
      const allFiles = getAllFiles();
      
      // Ensure files is defined
      if (!allFiles || typeof allFiles !== 'object' || Object.keys(allFiles).length === 0) {
        setError('No files available');
        setIsLoading(false);
        return;
      }

      // Detect project type
      const detectedType = detectProjectType(allFiles);
      setProjectType(detectedType);

      // Bundle project
      const bundled = bundleProject(allFiles);
      
      setBundlerErrors(bundled.errors);
      setBundlerWarnings(bundled.warnings);

      if (bundled.errors.length > 0 && !bundled.html) {
        setError(`Bundling failed: ${bundled.errors.join(', ')}`);
        setIsLoading(false);
        return;
      }

      // If no HTML file and not a React project, show placeholder
      if (!bundled.html && detectedType === 'html') {
        const hasFiles = Object.keys(allFiles).length > 0;
        const iframe = iframeRef.current;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          if (hasFiles) {
            doc.write(`
              <html>
                <head>
                  <style>
                    body { 
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                      padding: 2rem;
                      color: #666;
                      text-align: center;
                    }
                    .message { margin: 2rem 0; }
                    .files { 
                      margin-top: 2rem;
                      padding: 1rem;
                      background: #f5f5f5;
                      border-radius: 8px;
                      text-align: left;
                    }
                    .file-item { margin: 0.5rem 0; }
                  </style>
                </head>
                <body>
                  <h1>Preview Unavailable</h1>
                  <div class="message">
                    <p>No HTML file was generated. The preview requires an <code>index.html</code> file.</p>
                    <p>Generated files:</p>
                    <div class="files">
                      ${Object.keys(allFiles).map(f => `<div class="file-item">📄 ${f}</div>`).join('')}
                    </div>
                  </div>
                </body>
              </html>
            `);
          } else {
            doc.write('<html><body><h1 style="padding: 2rem; color: #666;">Preview will appear here</h1></body></html>');
          }
          doc.close();
        }
        setError(hasFiles ? 'No HTML file found' : null);
        setIsLoading(false);
        return;
      }

      // Render bundled HTML
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      
      if (doc && bundled.html) {
        doc.open();
        doc.write(bundled.html);
        doc.close();
        setError(null);
      }
    } catch (err) {
      console.error('Preview error:', err);
      setError(err instanceof Error ? err.message : 'Error loading preview');
    } finally {
      setIsLoading(false);
    }
  }, [getAllFiles]);

  // Render on files change
  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  // Handle refresh
  const handleRefresh = () => {
    clearCache();
    renderPreview();
  };

  // Handle open in new tab
  const handleOpenInNewTab = () => {
    const allFiles = getAllFiles();
    const bundled = bundleProject(allFiles);
    
    if (bundled.html) {
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(bundled.html);
        newWindow.document.close();
      }
    }
  };

  // Get device frame styles
  const getDeviceFrameStyles = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      width: '100%',
      height: '100%',
      border: 'none',
      transition: 'all 0.3s ease',
    };

    switch (deviceFrame) {
      case 'mobile':
        return {
          ...baseStyle,
          maxWidth: `${375 * (responsiveWidth / 100)}px`,
          margin: '0 auto',
          border: '8px solid #1a1a1a',
          borderRadius: '20px',
          boxShadow: '0 0 20px rgba(0,0,0,0.5)',
        };
      case 'tablet':
        return {
          ...baseStyle,
          maxWidth: `${768 * (responsiveWidth / 100)}px`,
          margin: '0 auto',
          border: '12px solid #1a1a1a',
          borderRadius: '12px',
          boxShadow: '0 0 20px rgba(0,0,0,0.5)',
        };
      case 'desktop':
        return {
          ...baseStyle,
          maxWidth: `${responsiveWidth}%`,
          margin: '0 auto',
        };
      default:
        return baseStyle;
    }
  };

  return (
    <div className="live-preview">
      <div className="preview-header">
        <div className="preview-header-left">
          <span>👁️ Live Preview</span>
          {projectType !== 'unknown' && (
            <span className="project-type-badge">{projectType.toUpperCase()}</span>
          )}
          {isLoading && <span className="loading-indicator">⏳ Bundling...</span>}
        </div>
        <div className="preview-controls">
          <div className="device-frame-controls">
            <button
              onClick={() => setDeviceFrame(deviceFrame === 'mobile' ? 'none' : 'mobile')}
              className={deviceFrame === 'mobile' ? 'active' : ''}
              title="Mobile frame"
            >
              <Smartphone size={16} />
            </button>
            <button
              onClick={() => setDeviceFrame(deviceFrame === 'tablet' ? 'none' : 'tablet')}
              className={deviceFrame === 'tablet' ? 'active' : ''}
              title="Tablet frame"
            >
              <Tablet size={16} />
            </button>
            <button
              onClick={() => setDeviceFrame(deviceFrame === 'desktop' ? 'none' : 'desktop')}
              className={deviceFrame === 'desktop' ? 'active' : ''}
              title="Desktop frame"
            >
              <Monitor size={16} />
            </button>
          </div>
          
          {deviceFrame !== 'none' && (
            <div className="responsive-width-control">
              <input
                type="range"
                min="50"
                max="100"
                value={responsiveWidth}
                onChange={(e) => setResponsiveWidth(Number(e.target.value))}
                title={`Width: ${responsiveWidth}%`}
              />
              <span>{responsiveWidth}%</span>
            </div>
          )}
          
          <button onClick={handleRefresh} title="Refresh preview">
            <RefreshCw size={16} />
          </button>
          <button onClick={handleOpenInNewTab} title="Open in new tab">
            <ExternalLink size={16} />
          </button>
        </div>
      </div>

      {(error || bundlerErrors.length > 0) && (
        <div className="preview-errors">
          {error && <div className="error-message">❌ {error}</div>}
          {bundlerErrors.map((err, i) => (
            <div key={i} className="error-message">❌ {err}</div>
          ))}
        </div>
      )}

      {bundlerWarnings.length > 0 && (
        <div className="preview-warnings">
          {bundlerWarnings.map((warn, i) => (
            <div key={i} className="warning-message">⚠️ {warn}</div>
          ))}
        </div>
      )}

      <div className="preview-container" style={deviceFrame !== 'none' ? { padding: '1rem' } : {}}>
        <iframe 
          ref={iframeRef} 
          title="preview" 
          sandbox="allow-scripts allow-same-origin"
          style={getDeviceFrameStyles()}
        />
      </div>
    </div>
  );
}
