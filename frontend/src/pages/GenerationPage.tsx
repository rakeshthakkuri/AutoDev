import { useState, useEffect, useCallback } from 'react';
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
import SaveProjectModal from '../components/SaveProjectModal';
import GenerationProgress from '../components/GenerationProgress';
import GenerationLayout from '../components/GenerationLayout';
import { GenerationStore } from '../store/generation';
import { downloadProjectAsZip } from '../services/downloadZip';
import { Sparkles, FileCode, Loader2 } from 'lucide-react';
import '../App.css';

export default function GenerationPage() {
  const [searchParams] = useSearchParams();
  const [activeFile, setActiveFile] = useState<string>('');
  const [lastPrompt, setLastPrompt] = useState<string>('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

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
    confirmDiscardChanges,
    getFileContent,
    resetProject,
    cancelGeneration,
    generationPlan,
    analysisFallbackWarning,
    planFallbackWarning,
    streamingFile,
    backendConnected,
    checkHealth,
    selectedFramework,
    providerRetry,
    generationDegraded,
  } = GenerationStore();

  const effectivePrompt = currentPrompt || lastPrompt;

  const handleSaveProject = useCallback(() => {
    if (Object.keys(files).length === 0) {
      toast.error('No project to save');
      return;
    }
    setShowSaveDialog(true);
  }, [files]);

  const handleNewProject = useCallback(() => {
    if (!confirmDiscardChanges('You have unsaved changes. Start new project? Unsaved changes will be lost.')) return;
    resetProject();
    setActiveFile('');
    setLastPrompt('');
  }, [confirmDiscardChanges, resetProject]);

  useEffect(() => {
    // Single health check on mount; BackendConnectionBanner owns the polling interval
    checkHealth();
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
  }, [handleSaveProject, handleNewProject]);

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

  const handleLoadProject = (project: { files: Record<string, string>; editedFiles?: Record<string, string>; prompt: string; name: string }) => {
    if (!confirmDiscardChanges('You have unsaved changes. Loading will discard them. Continue?')) return;
    const { loadProject } = GenerationStore.getState();
    loadProject(project.files, project.editedFiles, project.prompt);
    setLastPrompt(project.prompt);
    setActiveFile('');
    toast.success(`Loaded "${project.name}"`);
  };

  const hasProject = Object.keys(files).length > 0;
  const planFiles = generationPlan?.files ?? [];
  const fileCount = Object.keys(files).length;
  const editCount = Object.keys(editedFiles).length;

  const leftPanelContent = (
    <>
      {error && (
        <div className="panel-section">
          <ErrorDisplay error={error} onRetry={() => retryGeneration(effectivePrompt)} onDismiss={clearError} />
        </div>
      )}

      {(analysisFallbackWarning || planFallbackWarning) && (
        <div className="panel-section fallback-warnings">
          <div className="fallback-warning-banner" role="status">
            {analysisFallbackWarning && <p>{analysisFallbackWarning}</p>}
            {planFallbackWarning && <p>{planFallbackWarning}</p>}
          </div>
        </div>
      )}

      <GenerationProgress
        isGenerating={isGenerating}
        progress={progress}
        planFiles={planFiles}
        files={files}
        streamingFile={streamingFile}
        onCancel={cancelGeneration}
        providerRetry={providerRetry}
        generationDegraded={generationDegraded}
      />

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
            <FileTree
              files={files}
              onFileClick={setActiveFile}
              activeFile={activeFile}
              validationResults={validationResults ?? {}}
              editedFiles={editedFiles ?? {}}
            />
          </ErrorBoundary>
        </div>
      )}
    </>
  );

  const centerPanelContent = (
    <>
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
        <CodeEditor key={activeFile || 'empty'} file={activeFile} content={getFileContent(activeFile)} />
      </ErrorBoundary>
    </>
  );

  const rightPanelContent = (
    <ErrorBoundary>
      <LivePreview files={files} />
    </ErrorBoundary>
  );

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

      <SaveProjectModal
        open={showSaveDialog}
        files={files}
        editedFiles={editedFiles}
        prompt={effectivePrompt}
        onClose={() => setShowSaveDialog(false)}
      />

      <ProjectHistorySidebar
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onLoadProject={handleLoadProject}
      />

      {!hasProject && !isGenerating ? (
        <div className="generation-empty-state">
          <div className="empty-state-content">
            <div className="empty-state-icon">
              <Sparkles size={52} />
            </div>
            <h2>Start Building</h2>
            <p>Describe your project and watch AI generate a complete, working web application</p>
            <div className="empty-state-prompt">
              <PromptInput
                onGenerate={(prompt) => setLastPrompt(prompt)}
                initialValue={urlPrompt ? decodeURIComponent(urlPrompt) : ''}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          <GenerationLayout left={leftPanelContent} center={centerPanelContent} right={rightPanelContent} />

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
