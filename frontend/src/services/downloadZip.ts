import { downloadZip as downloadZipApi } from './api';

/**
 * Build a ZIP from a map of file paths to content and trigger browser download.
 * Uses current file content (including edits) from the store.
 */
export async function downloadProjectAsZip(
  files: Record<string, string>,
  getContent: (path: string) => string,
  filename = 'project.zip'
): Promise<void> {
  // Collect all file contents
  const filesWithContent: Record<string, string> = {};
  for (const path of Object.keys(files)) {
    filesWithContent[path] = getContent(path);
  }

  // Call backend to generate ZIP
  const blob = await downloadZipApi({ files: filesWithContent, filename });

  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  
  // Clean up
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
