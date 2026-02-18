import JSZip from 'jszip';

/**
 * Build a ZIP from a map of file paths to content and trigger browser download.
 * Uses current file content (including edits) from the store.
 */
export async function downloadProjectAsZip(
  files: Record<string, string>,
  getContent: (path: string) => string,
  filename = 'project.zip'
): Promise<void> {
  const zip = new JSZip();
  for (const path of Object.keys(files)) {
    const content = getContent(path);
    zip.file(path, content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
