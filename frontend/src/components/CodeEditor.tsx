import { useState, useEffect, useRef, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { Save, RotateCcw, Keyboard, Map, Loader2, ChevronRight } from 'lucide-react';
import { GenerationStore } from '../store/generation';
import { useSettingsStore } from '../store/settings';

interface CodeEditorProps {
  file: string;
  content: string;
}

function getLanguage(filename: string): string {
  if (!filename) return 'plaintext';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss', sass: 'scss', less: 'less',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    jsx: 'javascript', tsx: 'typescript', ts: 'typescript',
    json: 'json',
    md: 'markdown', mdx: 'markdown',
    vue: 'html',
    svelte: 'html',
    astro: 'html',
    xml: 'xml', svg: 'xml',
    yaml: 'yaml', yml: 'yaml',
    toml: 'ini',
    sh: 'shell', bash: 'shell',
  };
  return map[ext] || 'plaintext';
}

function formatFileSize(content: string): string {
  const bytes = new Blob([content]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileBreadcrumb({ path }: { path: string }) {
  if (!path) return null;
  const parts = path.split('/').filter(Boolean);
  return (
    <div className="editor-breadcrumb">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <ChevronRight size={10} className="breadcrumb-separator" />}
          <span className={i === parts.length - 1 ? 'breadcrumb-current' : ''}>
            {part}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function CodeEditor({ file, content }: CodeEditorProps) {
  const [editorContent, setEditorContent] = useState(content);
  const [isModified, setIsModified] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const editorRef = useRef<any>(null);

  const {
    files,
    editedFiles,
    saveFileEdit,
    revertFileEdit,
    getFileContent,
    streamingFile,
    streamingContent,
  } = GenerationStore();

  const appTheme = useSettingsStore((s) => s.theme);

  const isStreaming = streamingFile === file && !!file;
  const displayContent = isStreaming ? streamingContent : editorContent;

  const fileSize = useMemo(() => {
    if (!displayContent) return '';
    return formatFileSize(displayContent);
  }, [displayContent]);

  useEffect(() => {
    if (!file) {
      setEditorContent('');
      setIsModified(false);
      return;
    }
    const currentContent = getFileContent(file);
    setEditorContent(currentContent);
    setIsModified(file in editedFiles);
  }, [file, files, editedFiles]);

  useEffect(() => {
    if (isStreaming && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const lineCount = model.getLineCount();
        editorRef.current.revealLine(lineCount);
      }
    }
  }, [isStreaming, streamingContent]);

  const handleEditorChange = (value: string | undefined) => {
    if (!file || isStreaming) return;
    const newContent = value || '';
    setEditorContent(newContent);
    const originalContent = files[file] || '';
    setIsModified(newContent !== originalContent);
  };

  const handleSave = () => {
    if (!file) return;
    saveFileEdit(file, editorContent);
    setIsModified(false);
  };

  const handleRevert = () => {
    if (!file) return;
    revertFileEdit(file);
    setEditorContent(files[file] || '');
    setIsModified(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey && e.key === 's' && file && isModified) {
        e.preventDefault();
        saveFileEdit(file, editorContent);
        setIsModified(false);
      }

      if (modKey && e.key === 'z' && !e.shiftKey && file && isModified) {
        e.preventDefault();
        revertFileEdit(file);
        setEditorContent(files[file] || '');
        setIsModified(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file, isModified, editorContent, files, saveFileEdit, revertFileEdit]);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  const language = getLanguage(file);

  return (
    <div className="code-editor">
      <div className="editor-header">
        <span>
          {file ? (
            <>
              <FileBreadcrumb path={file} />
              {isModified && <span className="dirty-indicator"> *</span>}
              {isStreaming && (
                <span className="streaming-badge">
                  <Loader2 size={10} className="spin" />
                  Streaming
                </span>
              )}
            </>
          ) : (
            'Select a file to edit'
          )}
        </span>
        {file && (
          <div className="editor-actions">
            {fileSize && <span className="file-size-indicator">{fileSize}</span>}

            <div className="editor-toolbar">
              <button
                onClick={() => setShowMinimap(!showMinimap)}
                className={showMinimap ? 'active' : ''}
                title="Toggle minimap"
                aria-label="Toggle minimap"
              >
                <Map size={12} />
              </button>
            </div>

            <div className="shortcuts-hint">
              <Keyboard size={11} />
              <span>{navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘' : 'Ctrl'}+S</span>
            </div>

            {isModified && (
              <>
                <button
                  onClick={handleRevert}
                  className="btn-revert"
                  title="Revert changes"
                  aria-label="Revert changes"
                >
                  <RotateCcw size={12} />
                  Revert
                </button>
                <button
                  onClick={handleSave}
                  className="btn-save"
                  title="Save changes"
                  aria-label="Save changes"
                >
                  <Save size={12} />
                  Save
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {file ? (
        <Editor
          height="100%"
          defaultLanguage="javascript"
          language={language}
          value={displayContent || '// Select a file to view code'}
          theme={appTheme === 'dark' ? 'vs-dark' : 'light'}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: showMinimap },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            readOnly: isStreaming,
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: isStreaming ? 'phase' : 'blink',
            padding: { top: 12 },
            lineHeight: 22,
          }}
        />
      ) : (
        <div className="editor-skeleton">
          <div className="skeleton skeleton-line long" />
          <div className="skeleton skeleton-line medium" />
          <div className="skeleton skeleton-line long" />
          <div className="skeleton skeleton-line short" />
          <div className="skeleton skeleton-line medium" />
          <div className="skeleton skeleton-line long" />
          <div className="skeleton skeleton-line short" />
        </div>
      )}
    </div>
  );
}
