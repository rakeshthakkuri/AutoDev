import { useState, useEffect } from 'react';
import { X, Trash2, Download, Search, Calendar, FileText, Grid, List, BookOpen } from 'lucide-react';
import { listProjects, deleteProject, ProjectData, clearAllProjects } from '../services/storage';

interface ProjectHistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadProject: (project: ProjectData) => void;
}

export default function ProjectHistorySidebar({ isOpen, onClose, onLoadProject }: ProjectHistorySidebarProps) {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');

  useEffect(() => {
    if (isOpen) {
      refreshProjects();
    }
  }, [isOpen]);

  const refreshProjects = () => {
    const allProjects = listProjects();
    setProjects(allProjects);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this project?')) {
      deleteProject(id);
      refreshProjects();
    }
  };

  const handleLoad = (project: ProjectData) => {
    if (window.confirm('Load this project? Current unsaved changes will be lost.')) {
      onLoadProject(project);
      onClose();
    }
  };

  const handleExport = (project: ProjectData, e: React.MouseEvent) => {
    e.stopPropagation();
    const dataStr = JSON.stringify(project, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.name || project.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleClearAll = () => {
    if (window.confirm('Delete ALL saved projects? This cannot be undone.')) {
      clearAllProjects();
      refreshProjects();
    }
  };

  const filteredProjects = projects
    .filter(project => {
      const query = searchQuery.toLowerCase();
      return (
        project.name.toLowerCase().includes(query) ||
        project.prompt.toLowerCase().includes(query) ||
        project.id.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'date') {
        return b.timestamp - a.timestamp;
      } else {
        return (a.name || a.id).localeCompare(b.name || b.id);
      }
    });

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) return null;

  return (
    <div className="project-history-sidebar-overlay" onClick={onClose}>
      <div className="project-history-sidebar" onClick={(e) => e.stopPropagation()}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">
            <BookOpen size={22} />
            Project History
          </h2>
          <button onClick={onClose} className="btn-close">
            <X size={20} />
          </button>
        </div>

        <div className="sidebar-controls">
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="view-controls">
            <button
              onClick={() => setViewMode('grid')}
              className={viewMode === 'grid' ? 'active' : ''}
              title="Grid view"
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={viewMode === 'list' ? 'active' : ''}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'date' | 'name')}>
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>

        <div className="sidebar-content">
          {filteredProjects.length === 0 ? (
            <div className="empty-state">
              <FileText size={48} />
              <p>No saved projects</p>
              {searchQuery && <p className="hint">Try a different search term</p>}
            </div>
          ) : (
            <div className={`projects-${viewMode}`}>
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className="project-card"
                  onClick={() => handleLoad(project)}
                >
                  {project.thumbnail ? (
                    <div className="project-thumbnail">
                      <img src={project.thumbnail} alt={project.name} />
                    </div>
                  ) : (
                    <div className="project-thumbnail placeholder">
                      <FileText size={32} />
                    </div>
                  )}
                  
                  <div className="project-info">
                    <h3>{project.name || 'Untitled Project'}</h3>
                    <p className="project-prompt">
                    {project.prompt.length > 100
                      ? `${project.prompt.substring(0, 100)}…`
                      : project.prompt}
                  </p>
                    <div className="project-meta">
                      <span>
                        <Calendar size={12} />
                        {formatDate(project.timestamp)}
                      </span>
                      {project.metadata && (
                        <span>
                          {project.metadata.fileCount} files
                          {project.metadata.hasEdits && ' (edited)'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="project-actions">
                    <button
                      onClick={(e) => handleExport(project, e)}
                      className="btn-icon"
                      title="Export to JSON"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(project.id, e)}
                      className="btn-icon btn-danger"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {projects.length > 0 && (
          <div className="sidebar-footer">
            <button onClick={handleClearAll} className="btn-clear-all">
              Clear All Projects
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
