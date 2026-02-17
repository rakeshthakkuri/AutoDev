import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PromptInput from '../components/PromptInput';
import FileTree from '../components/FileTree';
import CodeEditor from '../components/CodeEditor';
import LivePreview from '../components/LivePreview';
import ErrorDisplay from '../components/ErrorDisplay';
import ProjectHistorySidebar from '../components/ProjectHistorySidebar';
import ErrorBoundary from '../components/ErrorBoundary';
import { GenerationStore } from '../store/generation';
import { saveProject, loadProject, generateProjectId, ProjectData, getStorageInfo } from '../services/storage';
import { Save, History, Sparkles, Home, FileCode, Eye, Settings, X } from 'lucide-react';
import '../App.css';

export default function GenerationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeFile, setActiveFile] = useState<string>('');
  const [lastPrompt, setLastPrompt] = useState<string>('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  
  // Get prompt from URL parameters
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
    clearEdits
  } = GenerationStore();

  // Auto-save on successful generation (optional - can be toggled)
  useEffect(() => {
    if (!isGenerating && Object.keys(files).length > 0 && !error) {
      // Auto-save is disabled by default, but can be enabled
      // Uncomment the line below to enable auto-save
      // handleAutoSave();
    }
  }, [isGenerating, files, error]);

  const captureThumbnail = async (): Promise<string | null> => {
    try {
      // Find the preview iframe
      const iframe = document.querySelector('.live-preview iframe') as HTMLIFrameElement;
      if (!iframe || !iframe.contentWindow) return null;

      // Use html2canvas or similar library, or a simpler approach
      // For now, we'll use a canvas-based approach
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Draw a placeholder or try to capture the iframe content
      // Note: Cross-origin restrictions may prevent direct capture
      // For now, we'll create a simple placeholder
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Preview', canvas.width / 2, canvas.height / 2);

      return canvas.toDataURL('image/png', 0.7);
    } catch (error) {
      console.error('Error capturing thumbnail:', error);
      return null;
    }
  };

  const handleSaveProject = async () => {
    if (Object.keys(files).length === 0) {
      alert('No project to save');
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
      metadata: {
        fileCount: Object.keys(files).length,
        hasEdits: Object.keys(editedFiles).length > 0
      }
    };

    const success = saveProject(project);
    if (success) {
      alert('Project saved successfully!');
      setShowSaveDialog(false);
      setProjectName('');
    } else {
      alert('Failed to save project. Storage may be full.');
    }
  };

  const handleLoadProject = (project: ProjectData) => {
    if (hasUnsavedChanges()) {
      const confirmed = window.confirm(
        'You have unsaved changes. Loading a project will discard them. Continue?'
      );
      if (!confirmed) return;
    }

    const { loadProject } = GenerationStore.getState();
    loadProject(project.files, project.editedFiles, project.prompt);
    setLastPrompt(project.prompt);
    setActiveFile(''); // Reset active file
  };

  const handleExportWithEdits = async () => {
    // This would trigger a download with edited files
    // For now, we'll just show a message
    const hasEdits = Object.keys(editedFiles).length > 0;
    if (hasEdits) {
      alert('Export with edits functionality will be implemented in the backend.');
    }
  };

  const storageInfo = getStorageInfo();
  const hasProject = Object.keys(files).length > 0;

  return (
    <div className="app">
      <header className="header-modern">
        <div className="header-content">
          <div className="header-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <Sparkles size={24} />
            <span>AI Code Generator</span>
          </div>
          <div className="header-actions">
            <button 
              onClick={() => navigate('/')} 
              className="btn-header-modern"
              title="Home"
            >
              <Home size={18} />
              Home
            </button>
            <button 
              onClick={() => setIsHistoryOpen(true)} 
              className="btn-header-modern"
              title="Project History"
            >
              <History size={18} />
              History
            </button>
            <button 
              onClick={handleSaveProject} 
              className="btn-header-modern"
              disabled={Object.keys(files).length === 0}
              title="Save Project"
            >
              <Save size={18} />
              Save
            </button>
            {hasUnsavedChanges() && (
              <span className="unsaved-indicator" title="You have unsaved changes">
                *
              </span>
            )}
          </div>
        </div>
        {storageInfo.percentage > 80 && (
          <div className="storage-warning">
            ⚠️ Storage almost full ({storageInfo.percentage.toFixed(1)}%)
          </div>
        )}
      </header>

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
                if (e.key === 'Enter' && projectName.trim()) {
                  handleSaveProject();
                } else if (e.key === 'Escape') {
                  setShowSaveDialog(false);
                }
              }}
            />
            <div className="modal-actions">
              <button onClick={() => setShowSaveDialog(false)}>Cancel</button>
              <button 
                onClick={handleSaveProject} 
                disabled={!projectName.trim()}
                className="btn-primary"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <ProjectHistorySidebar
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onLoadProject={handleLoadProject}
      />

      {!hasProject && !isGenerating ? (
        // Empty state - show prompt input prominently
        <div className="generation-empty-state">
          <div className="empty-state-content">
            <div className="empty-state-icon">
              <Sparkles size={64} />
            </div>
            <h2>Start Creating Your Project</h2>
            <p>Describe what you want to build and watch as AI generates your complete web application</p>
            <div className="empty-state-prompt">
              <PromptInput 
                onGenerate={(prompt) => setLastPrompt(prompt)} 
                initialValue={urlPrompt ? decodeURIComponent(urlPrompt) : ''}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="generation-layout">
          {/* Left Panel - Prompt & File Tree */}
          <div className={`left-panel ${leftPanelCollapsed ? 'collapsed' : ''}`}>
            <div className="panel-header">
              <div className="panel-title">
                <FileCode size={18} />
                <span>Project Files</span>
              </div>
              <button 
                className="panel-toggle"
                onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
                title={leftPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
              >
                <X size={16} />
              </button>
            </div>
            
            {!leftPanelCollapsed && (
              <>
                {!hasProject && (
                  <div className="panel-section">
                    <PromptInput 
                      onGenerate={(prompt) => setLastPrompt(prompt)} 
                      initialValue={urlPrompt ? decodeURIComponent(urlPrompt) : ''}
                    />
                  </div>
                )}
              
              {error && (
                <div className="panel-section">
                  <ErrorDisplay 
                    error={error}
                    onRetry={() => retryGeneration(lastPrompt)}
                    onDismiss={clearError}
                  />
                </div>
              )}
              
              {isGenerating && (
                <div className="panel-section">
                  <div className="progress-modern">
                    <div className="progress-header">
                      <span>Generating Project</span>
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
                      <div className={`progress-step ${progress > 33 ? 'active' : ''}`}>
                        <div className="step-indicator" />
                        <span>Planning</span>
                      </div>
                      <div className={`progress-step ${progress > 66 ? 'active' : ''}`}>
                        <div className="step-indicator" />
                        <span>Generating</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {Object.keys(fileErrors).length > 0 && (
                <div className="panel-section">
                  <div className="file-errors">
                    <h4>⚠️ File Errors:</h4>
                    {Object.values(fileErrors).map((fileError, i) => (
                      <div key={i} className="file-error-item">
                        <strong>{fileError.path}:</strong> {fileError.error}
                        {fileError.attempts > 0 && <span> (Attempted {fileError.attempts} times)</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {Object.keys(files || {}).length > 0 && (
                <div className="panel-section">
                  <ErrorBoundary>
                    <FileTree 
                      files={files || {}} 
                      onFileClick={setActiveFile} 
                      activeFile={activeFile}
                      validationResults={validationResults || {}}
                      editedFiles={editedFiles || {}}
                    />
                  </ErrorBoundary>
                </div>
              )}
            </>
          )}
        </div>

        {/* Center Panel - Code Editor */}
        <div className="center-panel">
          <div className="panel-header">
            <div className="panel-title">
              <FileCode size={18} />
              <span>{activeFile || 'No file selected'}</span>
            </div>
          </div>
          <ErrorBoundary>
            <CodeEditor file={activeFile} content={files?.[activeFile] || ''} />
          </ErrorBoundary>
        </div>

        {/* Right Panel - Live Preview */}
        <div className={`right-panel ${rightPanelCollapsed ? 'collapsed' : ''}`}>
          <div className="panel-header">
            <div className="panel-title">
              <Eye size={18} />
              <span>Live Preview</span>
            </div>
            <button 
              className="panel-toggle"
              onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
              title={rightPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              <X size={16} />
            </button>
          </div>
          {!rightPanelCollapsed && (
            <ErrorBoundary>
              <LivePreview files={files || {}} />
            </ErrorBoundary>
          )}
        </div>
        </div>
      )}
    </div>
  );
}
