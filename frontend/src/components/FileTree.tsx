import { File, AlertCircle, CheckCircle } from 'lucide-react';

interface ValidationResult {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  fixes_applied: string[];
}

interface FileTreeProps {
  files: Record<string, string>;
  onFileClick: (path: string) => void;
  activeFile: string;
  validationResults?: Record<string, ValidationResult>;
  editedFiles?: Record<string, string>;
}

export default function FileTree({ files, onFileClick, activeFile, validationResults = {}, editedFiles = {} }: FileTreeProps) {
  const getFileStatus = (path: string) => {
    const validation = validationResults[path];
    if (!validation) return null;
    
    if (!validation.is_valid && validation.errors.length > 0) {
      return 'error';
    }
    if (validation.warnings.length > 0 || validation.fixes_applied.length > 0) {
      return 'warning';
    }
    return 'valid';
  };

  return (
    <div className="file-tree">
      <h3>📁 Project Files</h3>
      <div className="files">
        {Object.keys(files).map(path => {
          const status = getFileStatus(path);
          const validation = validationResults[path];
          
          return (
            <div
              key={path}
              className={`file-item ${activeFile === path ? 'active' : ''} ${status ? `status-${status}` : ''}`}
              onClick={() => onFileClick(path)}
              title={validation ? 
                `Valid: ${validation.is_valid}, Errors: ${validation.errors.length}, Warnings: ${validation.warnings.length}` : 
                undefined
              }
            >
              {status === 'error' && <AlertCircle size={14} className="status-icon error-icon" />}
              {status === 'valid' && <CheckCircle size={14} className="status-icon valid-icon" />}
              {status === 'warning' && <AlertCircle size={14} className="status-icon warning-icon" />}
              <File size={16} />
              <span>
                {path}
                {path in editedFiles && <span className="dirty-indicator" title="Modified"> *</span>}
              </span>
              {validation?.fixes_applied.length > 0 && (
                <span className="fix-badge" title={`Auto-fixed: ${validation.fixes_applied.join(', ')}`}>
                  🔧
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
