import { Link, useLocation } from 'react-router-dom';
import { Sparkles, Home, History, Save, Download, Plus, Sun, Moon, Menu } from 'lucide-react';
import { GenerationStore } from '../store/generation';
import { useSettingsStore } from '../store/settings';
import { getStorageInfo } from '../services/storage';

interface NavbarProps {
  onHistoryOpen?: () => void;
  onSaveClick?: () => void;
  onDownloadClick?: () => void;
  onNewProject?: () => void;
  onMenuOpen?: () => void;
  showSave?: boolean;
  showDownload?: boolean;
  showNew?: boolean;
}

export default function Navbar({
  onHistoryOpen,
  onSaveClick,
  onDownloadClick,
  onNewProject,
  onMenuOpen,
  showSave = false,
  showDownload = false,
  showNew = false,
}: NavbarProps) {
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const fileCount = GenerationStore((s) => Object.keys(s.files).length);
  const hasEdits = GenerationStore((s) => Object.keys(s.editedFiles).length > 0);
  const canSave = fileCount > 0;
  const storageInfo = getStorageInfo();
  const theme = useSettingsStore((s) => s.theme);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);

  return (
    <header className={`navbar ${isLanding ? 'landing-nav' : ''}`} role="banner">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo" aria-label="AI Code Generator Home">
          <Sparkles className="navbar-logo-icon" size={22} />
          <span>AI Code Generator</span>
          <span className="navbar-version">v2.0</span>
        </Link>

        <nav className="navbar-actions" aria-label="Main navigation">
          {isLanding && (
            <button type="button" onClick={onMenuOpen} className="navbar-btn navbar-btn-menu" title="Menu" aria-label="Open menu">
              <Menu size={22} />
            </button>
          )}
          <Link to="/" className={`navbar-btn ${location.pathname === '/' ? 'active' : ''}`} title="Home" aria-label="Home" aria-current={location.pathname === '/' ? 'page' : undefined}>
            <Home size={16} /><span>Home</span>
          </Link>
          <Link to="/generate" className={`navbar-btn ${location.pathname === '/generate' ? 'active' : ''}`} title="Generate" aria-label="Generate project" aria-current={location.pathname === '/generate' ? 'page' : undefined}>
            <Sparkles size={16} /><span>Generate</span>
          </Link>
          <button type="button" onClick={onHistoryOpen} className="navbar-btn" title="Project History" aria-label="Open project history">
            <History size={16} /><span>History</span>
          </button>

          <button type="button" onClick={toggleTheme} className="navbar-btn" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {(showNew || showSave || showDownload) && <div className="navbar-divider" />}

          {showNew && (
            <button type="button" onClick={onNewProject} className="navbar-btn" title="New Project" aria-label="New project">
              <Plus size={16} /><span>New</span>
            </button>
          )}
          {showSave && (
            <button type="button" onClick={onSaveClick} className="navbar-btn navbar-btn-primary" disabled={!canSave} title="Save project" aria-label="Save project">
              <Save size={16} /><span>Save</span>
              {hasEdits && <span className="navbar-unsaved" aria-hidden="true">*</span>}
            </button>
          )}
          {showDownload && (
            <button type="button" onClick={onDownloadClick} className="navbar-btn" disabled={!canSave} title="Download as ZIP" aria-label="Download project as ZIP">
              <Download size={16} /><span>ZIP</span>
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
