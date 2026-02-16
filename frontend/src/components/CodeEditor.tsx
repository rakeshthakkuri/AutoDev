import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Save, RotateCcw, Keyboard } from 'lucide-react';
import { GenerationStore } from '../store/generation';

interface CodeEditorProps {
  file: string;
  content: string;
}

export default function CodeEditor({ file, content }: CodeEditorProps) {
  const [editorContent, setEditorContent] = useState(content);
  const [isModified, setIsModified] = useState(false);
  const editorRef = useRef<any>(null);
  
  const { 
    files, 
    editedFiles, 
    saveFileEdit, 
    revertFileEdit,
    getFileContent 
  } = GenerationStore();

  const getLanguage = (filename: string) => {
    if (filename.endsWith('.html')) return 'html';
    if (filename.endsWith('.css')) return 'css';
    if (filename.endsWith('.js')) return 'javascript';
    if (filename.endsWith('.jsx') || filename.endsWith('.tsx')) return 'typescript';
    if (filename.endsWith('.json')) return 'json';
    return 'plaintext';
  };

  // Update content when file changes
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

  const handleEditorChange = (value: string | undefined) => {
    if (!file) return;
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

  // Keyboard shortcuts
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

  return (
    <div className="code-editor">
      <div className="editor-header">
        <span>
          {file ? (
            <>
              {file}
              {isModified && <span className="dirty-indicator"> *</span>}
            </>
          ) : (
            'Select a file'
          )}
        </span>
        {file && (
          <div className="editor-actions">
            <div className="shortcuts-hint">
              <Keyboard size={12} />
              <span>{navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘' : 'Ctrl'}+S / {navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘' : 'Ctrl'}+Z</span>
            </div>
            {isModified && (
              <>
                <button 
                  onClick={handleRevert} 
                  className="btn-revert"
                  title="Revert changes (Cmd/Ctrl+Z)"
                >
                  <RotateCcw size={16} />
                  Revert
                </button>
                <button 
                  onClick={handleSave} 
                  className="btn-save"
                  title="Save changes (Cmd/Ctrl+S)"
                >
                  <Save size={16} />
                  Save
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <Editor
        height="100%"
        defaultLanguage="javascript"
        language={getLanguage(file)}
        value={editorContent || (file ? '// Select a file to view code' : '// Select a file to view code')}
        theme="vs-dark"
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          readOnly: false,
          wordWrap: 'on',
          automaticLayout: true
        }}
      />
    </div>
  );
}
