import { Link, useLocation } from 'react-router-dom';
import { Sparkles, Home, History, Save, Download, Plus } from 'lucide-react';
import { GenerationStore } from '../store/generation';
import { getStorageInfo } from '../services/storage';

interface NavbarProps {
  onHistoryOpen?: () => void;
  onSaveClick?: () => void;
  onDownloadClick?: () => void;
  onNewProject?: () => void;
  showSave?: boolean;
  showDownload?: boolean;
  showNew?: boolean;
}

export default function Navbar({
  onHistoryOpen,
  onSaveClick,
  onDownloadClick,
  onNewProject,
  showSave = false,
  showDownload = false,
  showNew = false,
}: NavbarProps) {
  const location = useLocation();
  const fileCount = GenerationStore((s) => Object.keys(s.files).length);
  const hasEdits = GenerationStore((s) => Object.keys(s.editedFiles).length > 0);
  // Framework can be used for display — kept in store for future use
  const canSave = fileCount > 0;
  const storageInfo = getStorageInfo();

  return (
    <header className="navbar" role="banner">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo" aria-label="AI Code Generator Home">
          <Sparkles className="navbar-logo-icon" size={22} />
          <span>AI Code Generator</span>
          <span className="navbar-version">v2.0</span>
        </Link>

        <nav className="navbar-actions" aria-label="Main navigation">
          <Link to="/" className={`navbar-btn ${location.pathname === '/' ? 'active' : ''}`} title="Home" aria-label="Home" aria-current={location.pathname === '/' ? 'page' : undefined}>
            <Home size={18} /><span>Home</span>
          </Link>
          <Link to="/generate" className={`navbar-btn ${location.pathname === '/generate' ? 'active' : ''}`} title="Generate" aria-label="Generate project" aria-current={location.pathname === '/generate' ? 'page' : undefined}>
            <span>Generate</span>
          </Link>
          <button type="button" onClick={onHistoryOpen} className="navbar-btn" title="Project History" aria-label="Open project history">
            <History size={18} /><span>History</span>
          </button>
          {showNew && (
            <button type="button" onClick={onNewProject} className="navbar-btn" title="New Project (⌘N)" aria-label="New project">
              <Plus size={18} /><span>New</span>
            </button>
          )}
          {showSave && (
            <button type="button" onClick={onSaveClick} className="navbar-btn navbar-btn-primary" disabled={!canSave} title="Save project (⌘S)" aria-label="Save project">
              <Save size={18} /><span>Save</span>
              {hasEdits && <span className="navbar-unsaved" aria-hidden="true">•</span>}
            </button>
          )}
          {showDownload && (
            <button type="button" onClick={onDownloadClick} className="navbar-btn" disabled={!canSave} title="Download as ZIP" aria-label="Download project as ZIP">
              <Download size={18} /><span>ZIP</span>
            </button>
          )}
        </nav>
      </div>
      {storageInfo.percentage > 80 && (
        <div className="navbar-storage-warning" role="alert">Storage almost full ({storageInfo.percentage.toFixed(0)}%)</div>
      )}
    </header>
  );
}
