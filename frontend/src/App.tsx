import { useState, useEffect, useRef } from 'react';
import PromptInput from './components/PromptInput';
import FileTree from './components/FileTree';
import CodeEditor from './components/CodeEditor';
import LivePreview from './components/LivePreview';
import ErrorDisplay from './components/ErrorDisplay';
import ProjectHistorySidebar from './components/ProjectHistorySidebar';
import LandingPage from './components/LandingPage';
import { GenerationStore } from './store/generation';
import { saveProject, loadProject, generateProjectId, ProjectData, getStorageInfo } from './services/storage';
import { Save, History, Sparkles } from 'lucide-react';
import './App.css';

function App() {
  const [activeFile, setActiveFile] = useState<string>('');
  const [lastPrompt, setLastPrompt] = useState<string>('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [projectName, setProjectName] = useState('');
  
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

  // Show landing page if no project
  if (!hasProject && !isGenerating) {
    return (
      <div className="app">
        <header className="header-modern">
          <div className="header-content">
            <div className="header-logo">
              <Sparkles size={24} />
              <span>AI Code Generator</span>
            </div>
            <div className="header-actions">
              <button 
                onClick={() => setIsHistoryOpen(true)} 
                className="btn-header-modern"
                title="Project History"
              >
                <History size={18} />
                History
              </button>
            </div>
          </div>
        </header>
        <LandingPage />
        <ProjectHistorySidebar
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          onLoadProject={handleLoadProject}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header-modern">
        <div className="header-content">
          <div className="header-logo">
            <Sparkles size={24} />
            <span>AI Code Generator</span>
          </div>
          <div className="header-actions">
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

      <div className="layout">
        <div className="left-panel">
          <PromptInput onGenerate={(prompt) => setLastPrompt(prompt)} />
          
          {error && (
            <ErrorDisplay 
              error={error}
              onRetry={() => retryGeneration(lastPrompt)}
              onDismiss={clearError}
            />
          )}
          
          {isGenerating && (
            <div className="progress">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
              <p>Generating... {progress}%</p>
            </div>
          )}
          
          {Object.keys(fileErrors).length > 0 && (
            <div className="file-errors">
              <h4>⚠️ File Errors:</h4>
              {Object.values(fileErrors).map((fileError, i) => (
                <div key={i} className="file-error-item">
                  <strong>{fileError.path}:</strong> {fileError.error}
                  {fileError.attempts > 0 && <span> (Attempted {fileError.attempts} times)</span>}
                </div>
              ))}
            </div>
          )}
          
          {Object.keys(files).length > 0 && (
            <FileTree 
              files={files} 
              onFileClick={setActiveFile} 
              activeFile={activeFile}
              validationResults={validationResults}
              editedFiles={editedFiles}
            />
          )}
        </div>

        <div className="center-panel">
          <CodeEditor file={activeFile} content={files[activeFile] || ''} />
        </div>

        <div className="right-panel">
          <LivePreview files={files} />
        </div>
      </div>
    </div>
  );
}

export default App;
