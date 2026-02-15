export interface ProjectData {
  id: string;
  name: string;
  prompt: string;
  files: Record<string, string>;
  editedFiles?: Record<string, string>;
  timestamp: number;
  thumbnail?: string; // base64 encoded image
  metadata?: {
    fileCount: number;
    framework?: string;
    hasEdits?: boolean;
  };
}

const STORAGE_PREFIX = 'ai_project_';
const STORAGE_INDEX_KEY = 'ai_projects_index';

/**
 * Get all project IDs from localStorage
 */
function getProjectIndex(): string[] {
  try {
    const index = localStorage.getItem(STORAGE_INDEX_KEY);
    return index ? JSON.parse(index) : [];
  } catch (error) {
    console.error('Error reading project index:', error);
    return [];
  }
}

/**
 * Update project index
 */
function updateProjectIndex(projectId: string, add: boolean = true) {
  try {
    const index = getProjectIndex();
    if (add && !index.includes(projectId)) {
      index.push(projectId);
    } else if (!add) {
      const idx = index.indexOf(projectId);
      if (idx > -1) index.splice(idx, 1);
    }
    localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(index));
  } catch (error) {
    console.error('Error updating project index:', error);
  }
}

/**
 * Save project to localStorage
 */
export function saveProject(project: ProjectData): boolean {
  try {
    const key = `${STORAGE_PREFIX}${project.id}`;
    localStorage.setItem(key, JSON.stringify(project));
    updateProjectIndex(project.id, true);
    return true;
  } catch (error: any) {
    if (error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded. Consider deleting old projects.');
      // Try to free up space by removing oldest projects
      const projects = listProjects();
      if (projects.length > 0) {
        // Remove oldest project and retry
        const oldest = projects.sort((a, b) => a.timestamp - b.timestamp)[0];
        deleteProject(oldest.id);
        return saveProject(project); // Retry
      }
    }
    console.error('Error saving project:', error);
    return false;
  }
}

/**
 * Load project from localStorage
 */
export function loadProject(id: string): ProjectData | null {
  try {
    const key = `${STORAGE_PREFIX}${id}`;
    const data = localStorage.getItem(key);
    if (!data) return null;
    return JSON.parse(data) as ProjectData;
  } catch (error) {
    console.error('Error loading project:', error);
    return null;
  }
}

/**
 * List all saved projects
 */
export function listProjects(): ProjectData[] {
  try {
    const index = getProjectIndex();
    const projects: ProjectData[] = [];
    
    for (const id of index) {
      const project = loadProject(id);
      if (project) {
        projects.push(project);
      }
    }
    
    // Sort by timestamp (newest first)
    return projects.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Error listing projects:', error);
    return [];
  }
}

/**
 * Delete project from localStorage
 */
export function deleteProject(id: string): boolean {
  try {
    const key = `${STORAGE_PREFIX}${id}`;
    localStorage.removeItem(key);
    updateProjectIndex(id, false);
    return true;
  } catch (error) {
    console.error('Error deleting project:', error);
    return false;
  }
}

/**
 * Generate a unique project ID
 */
export function generateProjectId(): string {
  return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get storage usage info
 */
export function getStorageInfo(): { used: number; available: number; percentage: number } {
  try {
    let used = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        used += localStorage[key].length + key.length;
      }
    }
    
    // Estimate available (most browsers have 5-10MB limit)
    const estimatedLimit = 5 * 1024 * 1024; // 5MB
    const available = Math.max(0, estimatedLimit - used);
    const percentage = (used / estimatedLimit) * 100;
    
    return { used, available, percentage };
  } catch (error) {
    console.error('Error getting storage info:', error);
    return { used: 0, available: 0, percentage: 0 };
  }
}

/**
 * Clear all projects (use with caution)
 */
export function clearAllProjects(): boolean {
  try {
    const index = getProjectIndex();
    for (const id of index) {
      deleteProject(id);
    }
    localStorage.removeItem(STORAGE_INDEX_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing all projects:', error);
    return false;
  }
}
