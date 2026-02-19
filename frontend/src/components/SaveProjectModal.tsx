import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { saveProject, generateProjectId, type ProjectData } from '../services/storage';

function captureThumbnail(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Preview', canvas.width / 2, canvas.height / 2);
      resolve(canvas.toDataURL('image/png', 0.7));
    } catch {
      resolve(null);
    }
  });
}

export interface SaveProjectModalProps {
  open: boolean;
  files: Record<string, string>;
  editedFiles: Record<string, string>;
  prompt: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function SaveProjectModal({
  open,
  files,
  editedFiles,
  prompt,
  onClose,
  onSaved,
}: SaveProjectModalProps) {
  const [projectName, setProjectName] = useState('');

  const handleSave = useCallback(async () => {
    if (!projectName.trim()) return;

    const thumbnail = await captureThumbnail();
    const project: ProjectData = {
      id: generateProjectId(),
      name: projectName.trim(),
      prompt,
      files: { ...files },
      editedFiles: Object.keys(editedFiles).length > 0 ? { ...editedFiles } : undefined,
      timestamp: Date.now(),
      thumbnail: thumbnail ?? undefined,
      metadata: { fileCount: Object.keys(files).length, hasEdits: Object.keys(editedFiles).length > 0 },
    };

    const success = saveProject(project);
    if (success) {
      toast.success('Project saved!');
      setProjectName('');
      onClose();
      onSaved?.();
    } else {
      toast.error('Failed to save. Storage may be full.');
    }
  }, [files, editedFiles, prompt, projectName, onClose, onSaved]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Save Project</h3>
        <input
          type="text"
          placeholder="Project name..."
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && projectName.trim()) handleSave();
            else if (e.key === 'Escape') onClose();
          }}
        />
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleSave} disabled={!projectName.trim()} className="btn-primary">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
