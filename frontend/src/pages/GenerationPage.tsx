import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PromptInput from '../components/PromptInput';
import FileTree from '../components/FileTree';
import CodeEditor from '../components/CodeEditor';
import LivePreview from '../components/LivePreview';
import ErrorDisplay from '../components/ErrorDisplay';
import ProjectHistorySidebar from '../components/ProjectHistorySidebar';
import Navbar from '../components/Navbar';
import ErrorBoundary from '../components/ErrorBoundary';
import { GenerationStore } from '../store/generation';
import { saveProject, generateProjectId, ProjectData } from '../services/storage';
import { downloadProjectAsZip } from '../services/downloadZip';
import { Sparkles, FileCode, Eye, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import '../App.css';

// ─── Persist / Restore Panel Widths ──────────────────────────────────────────

const PANEL_STORAGE_KEY = 'ai-gen-panel-widths';
const DEFAULT_LEFT = 260;
const DEFAULT_RIGHT = 420;

function loadPanelWidths(): { left: number; right: number } {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { left: parsed.left || DEFAULT_LEFT, right: parsed.right || DEFAULT_RIGHT };
    }
  } catch { /* ignore */ }
  return { left: DEFAULT_LEFT, right: DEFAULT_RIGHT };
}

function savePanelWidths(left: number, right: number) {
  try { localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ left, right })); } catch { /* ignore */ }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GenerationPage() {
  const [searchParams] = useSearchParams();
  const [activeFile, setActiveFile] = useState<string>('');
  const [lastPrompt, setLastPrompt] = useState<string>('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  const [panelWidths, setPanelWidths] = useState(loadPanelWidths);
  const isDragging = useRef<'left' | 'right' | null>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const urlPrompt = searchParams.get('prompt') || '';
  const {
    files,
    editedFiles,
    isGenerating,
    progress,
    error,
    fileErrors,
    validationResults,
    currentPrompt,
    clearError,
    retryGeneration,
    hasUnsavedChanges,
    getFileContent,
    resetProject,
    cancelGeneration,
    generationPlan,
    streamingFile,
    backendConnected,
    checkHealth,
    selectedFramework,
  } = GenerationStore();

  const effectivePrompt = currentPrompt || lastPrompt;

  // Periodic health check while this page is mounted
  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15_000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  useEffect(() => {
    if (!activeFile && Object.keys(files).length > 0) {
      setActiveFile(Object.keys(files)[0]);
    }
  }, [files, activeFile]);

  useEffect(() => {
    if (streamingFile && !activeFile) {
      setActiveFile(streamingFile);
    }
  }, [streamingFile]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && e.key === 's') {
        e.preventDefault();
        handleSaveProject();
      }
      if (mod && e.shiftKey && e.key === 'p') {
        e.preventDefault();
        document.querySelector<HTMLTextAreaElement>('.prompt-input textarea')?.focus();
      }
      if (mod && e.key === 'n') {
        e.preventDefault();
        handleNewProject();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [files, projectName]);

  const startResize = useCallback((panel: 'left' | 'right', e: React.MouseEvent) => {
    isDragging.current = panel;
    dragStartX.current = e.clientX;
    dragStartWidth.current = panel === 'left' ? panelWidths.left : panelWidths.right;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [panelWidths]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - dragStartX.current;

      if (isDragging.current === 'left') {
        const newWidth = Math.max(180, Math.min(500, dragStartWidth.current + delta));
        setPanelWidths((prev) => ({ ...prev, left: newWidth }));
      } else {
        const newWidth = Math.max(250, Math.min(700, dragStartWidth.current - delta));
        setPanelWidths((prev) => ({ ...prev, right: newWidth }));
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        savePanelWidths(panelWidths.left, panelWidths.right);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [panelWidths]);

  const handleDoubleClickResize = useCallback((panel: 'left' | 'right') => {
    const defaults = { left: DEFAULT_LEFT, right: DEFAULT_RIGHT };
    setPanelWidths((prev) => ({ ...prev, [panel]: defaults[panel] }));
    savePanelWidths(
      panel === 'left' ? DEFAULT_LEFT : panelWidths.left,
      panel === 'right' ? DEFAULT_RIGHT : panelWidths.right
    );
  }, [panelWidths]);

  const captureThumbnail = async (): Promise<string | null> => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 400; canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Preview', canvas.width / 2, canvas.height / 2);
      return canvas.toDataURL('image/png', 0.7);
    } catch { return null; }
  };

  const handleSaveProject = useCallback(async () => {
    if (Object.keys(files).length === 0) {
      toast.error('No project to save');
      return;
    }
    if (!projectName.trim()) {
      setShowSaveDialog(true);
      return;
    }

    const thumbnail = await captureThumbnail();
    const project: ProjectData = {
      id: generateProjectId(),
      name: projectName.trim(),
      prompt: currentPrompt || lastPrompt,
      files: { ...files },
      editedFiles: Object.keys(editedFiles).length > 0 ? { ...editedFiles } : undefined,
      timestamp: Date.now(),
      thumbnail: thumbnail || undefined,
      metadata: { fileCount: Object.keys(files).length, hasEdits: Object.keys(editedFiles).length > 0 }
    };

    const success = saveProject(project);
    if (success) {
      toast.success('Project saved!');
      setShowSaveDialog(false);
      setProjectName('');
    } else {
      toast.error('Failed to save. Storage may be full.');
    }
  }, [files, editedFiles, projectName, currentPrompt, lastPrompt]);

  const handleDownloadZip = async () => {
    if (Object.keys(files).length === 0) return;
    try {
      await downloadProjectAsZip(files, getFileContent, 'project.zip');
      toast.success('Download started!');
    } catch (e) {
      console.error('Download ZIP failed', e);
      toast.error('Failed to create download.');
    }
  };

  const handleLoadProject = (project: ProjectData) => {
    if (hasUnsavedChanges()) {
      if (!window.confirm('You have unsaved changes. Loading will discard them. Continue?')) return;
    }
    const { loadProject } = GenerationStore.getState();
    loadProject(project.files, project.editedFiles, project.prompt);
    setLastPrompt(project.prompt);
    setActiveFile('');
    toast.success(`Loaded "${project.name}"`);
  };

  const handleNewProject = () => {
    if (hasUnsavedChanges()) {
      if (!window.confirm('You have unsaved changes. Start new project?')) return;
    }
    resetProject();
    setActiveFile('');
    setLastPrompt('');
    setProjectName('');
  };

  const hasProject = Object.keys(files).length > 0;
  const planFiles = generationPlan?.files || [];
  const fileCount = Object.keys(files).length;
  const editCount = Object.keys(editedFiles).length;

  // CSS custom properties for panel widths
  const layoutStyle = {
    '--left-w': `${panelWidths.left}px`,
    '--right-w': `${panelWidths.right}px`,
  } as React.CSSProperties;

  return (
    <div className="app">
      <Navbar
        onHistoryOpen={() => setIsHistoryOpen(true)}
        onSaveClick={handleSaveProject}
        onDownloadClick={handleDownloadZip}
        onNewProject={handleNewProject}
        showSave
        showDownload
        showNew={hasProject || isGenerating}
      />

      {showSaveDialog && (
        <div className="modal-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Save Project</h3>
            <input
              type="text"
              placeholder="Project name..."
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && projectName.trim()) handleSaveProject();
                else if (e.key === 'Escape') setShowSaveDialog(false);
              }}
            />
            <div className="modal-actions">
              <button onClick={() => setShowSaveDialog(false)}>Cancel</button>
              <button onClick={handleSaveProject} disabled={!projectName.trim()} className="btn-primary">Save</button>
            </div>
          </div>
        </div>
      )}

      <ProjectHistorySidebar isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} onLoadProject={handleLoadProject} />

      {!hasProject && !isGenerating ? (
        <div className="generation-empty-state">
          <div className="empty-state-content">
            <div className="empty-state-icon"><Sparkles size={52} /></div>
            <h2>Start Building</h2>
            <p>Describe your project and watch AI generate a complete, working web application</p>
            <div className="empty-state-prompt">
              <PromptInput onGenerate={(prompt) => setLastPrompt(prompt)} initialValue={urlPrompt ? decodeURIComponent(urlPrompt) : ''} />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="generation-layout" style={layoutStyle}>
            {/* ── Left Panel: Files ── */}
            {!leftPanelCollapsed && (
              <div className="left-panel" style={{ width: panelWidths.left, minWidth: 180, flexShrink: 0 }}>
                <div className="panel-header">
                  <div className="panel-title"><FileCode size={15} /><span>Files</span></div>
                  <button type="button" className="panel-toggle" onClick={() => setLeftPanelCollapsed(true)} title="Collapse" aria-label="Collapse file panel">
                    <ChevronLeft size={14} />
                  </button>
                </div>

                {error && (
                  <div className="panel-section">
                    <ErrorDisplay error={error} onRetry={() => retryGeneration(effectivePrompt)} onDismiss={clearError} />
                  </div>
                )}

                {isGenerating && (
                  <div className="panel-section" aria-live="polite">
                    <div className="progress-modern">
                      <div className="progress-header">
                        <span><Loader2 size={13} className="spin" /> Generating</span>
                        <span className="progress-percentage">{progress}%</span>
                      </div>
                      <div className="progress-bar-container">
                        <div className="progress-bar-modern" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="progress-steps">
                        <div className={`progress-step ${progress > 0 ? 'active' : ''}`}><div className="step-indicator" /><span>Analyzing</span></div>
                        <div className={`progress-step ${progress > 20 ? 'active' : ''}`}><div className="step-indicator" /><span>Planning</span></div>
                        <div className={`progress-step ${progress > 30 ? 'active' : ''}`}><div className="step-indicator" /><span>Generating</span></div>
                      </div>

                      <div className="cancel-container">
                        <button className="cancel-btn" onClick={cancelGeneration} aria-label="Cancel generation">
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
                              <div key={i} className={`planned-file ${isGenerated ? 'generated' : ''} ${isStreamingThis ? 'streaming' : ''}`}>
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
                )}

                {Object.keys(fileErrors).length > 0 && (
                  <div className="panel-section">
                    <div className="file-errors">
                      <h4>File Errors:</h4>
                      {Object.values(fileErrors).map((fe, i) => (
                        <div key={i} className="file-error-item">
                          <strong>{fe.path}:</strong> {fe.error}
                          {fe.attempts > 0 && <span> ({fe.attempts} attempts)</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(Object.keys(files).length > 0 || generationPlan) && (
                  <div className="panel-section panel-section-grow">
                    <ErrorBoundary>
                      <FileTree files={files} onFileClick={setActiveFile} activeFile={activeFile} validationResults={validationResults || {}} editedFiles={editedFiles || {}} />
                    </ErrorBoundary>
                  </div>
                )}
              </div>
            )}

            {/* Collapsed left panel toggle */}
            {leftPanelCollapsed && (
              <div className="collapsed-toggle">
                <button type="button" className="panel-toggle" onClick={() => setLeftPanelCollapsed(false)} title="Expand file panel" aria-label="Expand file panel">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            {/* Left resize handle */}
            {!leftPanelCollapsed && (
              <div
                className={`resize-handle ${isDragging.current === 'left' ? 'active' : ''}`}
                onMouseDown={(e) => startResize('left', e)}
                onDoubleClick={() => handleDoubleClickResize('left')}
                title="Drag to resize, double-click to reset"
              />
            )}

            {/* ── Center Panel: Editor ── */}
            <div className="center-panel" style={{ flex: 1, minWidth: 0 }}>
              <div className="panel-header">
                <div className="panel-title">
                  <FileCode size={15} />
                  <span>{activeFile || 'No file selected'}</span>
                  {streamingFile === activeFile && activeFile && (
                    <span className="streaming-badge">
                      <span className="streaming-dot-inline" />
                      Streaming
                    </span>
                  )}
                </div>
              </div>
              <ErrorBoundary>
                <CodeEditor file={activeFile} content={getFileContent(activeFile)} />
              </ErrorBoundary>
            </div>

            {/* Right resize handle */}
            {!rightPanelCollapsed && (
              <div
                className={`resize-handle ${isDragging.current === 'right' ? 'active' : ''}`}
                onMouseDown={(e) => startResize('right', e)}
                onDoubleClick={() => handleDoubleClickResize('right')}
                title="Drag to resize, double-click to reset"
              />
            )}

            {/* ── Right Panel: Preview ── */}
            {!rightPanelCollapsed && (
              <div className="right-panel" style={{ width: panelWidths.right, minWidth: 250, flexShrink: 0 }}>
                <div className="panel-header">
                  <div className="panel-title"><Eye size={15} /><span>Live Preview</span></div>
                  <button type="button" className="panel-toggle" onClick={() => setRightPanelCollapsed(true)} title="Collapse" aria-label="Collapse preview panel">
                    <ChevronRight size={14} />
                  </button>
                </div>
                <ErrorBoundary>
                  <LivePreview files={files || {}} />
                </ErrorBoundary>
              </div>
            )}

            {/* Collapsed right panel toggle */}
            {rightPanelCollapsed && (
              <div className="collapsed-toggle">
                <button type="button" className="panel-toggle" onClick={() => setRightPanelCollapsed(false)} title="Expand preview panel" aria-label="Expand preview panel">
                  <ChevronLeft size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Status Bar */}
          <div className="status-bar">
            <div className="status-bar-item">
              <div className={`status-bar-dot ${backendConnected ? 'connected' : 'disconnected'}`} />
              <span>{backendConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <div className="status-bar-item">
              <span>{fileCount} file{fileCount !== 1 ? 's' : ''}</span>
            </div>
            {editCount > 0 && (
              <div className="status-bar-item">
                <span>{editCount} edited</span>
              </div>
            )}
            {selectedFramework && selectedFramework !== 'auto' && (
              <div className="status-bar-item">
                <span>{selectedFramework}</span>
              </div>
            )}
            <div className="status-bar-spacer" />
            {isGenerating && (
              <div className="status-bar-item">
                <Loader2 size={10} className="spin" />
                <span>Generating... {progress}%</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
