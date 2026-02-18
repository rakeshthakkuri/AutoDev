import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { FolderOpen, Search, ChevronRight, AlertCircle, CheckCircle, FileCode, FileText, File } from 'lucide-react';
import { GenerationStore } from '../store/generation';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ValidationResult {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  fixes_applied: string[];
}

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFolder: boolean;
}

interface FileTreeProps {
  files: Record<string, string>;
  onFileClick: (path: string) => void;
  activeFile: string;
  validationResults?: Record<string, ValidationResult>;
  editedFiles?: Record<string, string>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getFileIconClass(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    html: 'file-icon-html', htm: 'file-icon-html',
    css: 'file-icon-css', scss: 'file-icon-css', sass: 'file-icon-css', less: 'file-icon-css',
    js: 'file-icon-js', mjs: 'file-icon-js', cjs: 'file-icon-js',
    ts: 'file-icon-ts',
    jsx: 'file-icon-jsx',
    tsx: 'file-icon-tsx',
    vue: 'file-icon-vue',
    svelte: 'file-icon-svelte',
    astro: 'file-icon-astro',
    json: 'file-icon-json',
  };
  if (map[ext]) return map[ext];
  if (name.startsWith('.') || name.includes('config') || name.includes('rc')) return 'file-icon-config';
  return 'file-icon-default';
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'astro'].includes(ext)) {
    return <FileCode size={13} />;
  }
  if (['html', 'htm', 'css', 'scss', 'sass', 'less', 'md', 'mdx', 'txt'].includes(ext)) {
    return <FileText size={13} />;
  }
  return <File size={13} />;
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of paths) {
    const parts = filePath.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;

      let existing = current.find((n) => n.name === name && n.isFolder === !isLast);
      if (!existing) {
        existing = {
          name,
          path: isLast ? filePath : parts.slice(0, i + 1).join('/'),
          children: [],
          isFolder: !isLast,
        };
        current.push(existing);
      }
      if (!isLast) {
        current = existing.children;
      }
    }
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    }).map(n => ({ ...n, children: sortNodes(n.children) }));
  };

  return sortNodes(root);
}

// ─── FolderNode Component ────────────────────────────────────────────────────

interface FolderNodeProps {
  node: TreeNode;
  depth: number;
  activeFile: string;
  onFileClick: (path: string) => void;
  validationResults: Record<string, ValidationResult>;
  editedFiles: Record<string, string>;
  searchQuery: string;
  streamingFile: string | null;
  plannedPaths: Set<string>;
  generatedPaths: Set<string>;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  focusedPath: string | null;
}

function FolderNode({
  node, depth, activeFile, onFileClick, validationResults, editedFiles,
  searchQuery, streamingFile, plannedPaths, generatedPaths,
  expandedFolders, toggleFolder, focusedPath,
}: FolderNodeProps) {
  const isExpanded = expandedFolders.has(node.path);
  const depthStyle = { '--depth': depth } as React.CSSProperties;

  if (node.isFolder) {
    return (
      <div className="tree-folder" role="treeitem" aria-expanded={isExpanded} aria-label={node.name}>
        <div
          className="tree-folder-header"
          style={depthStyle}
          onClick={() => toggleFolder(node.path)}
          data-path={node.path}
        >
          <ChevronRight size={12} className={`tree-folder-chevron ${isExpanded ? 'expanded' : ''}`} />
          <FolderOpen size={13} />
          <span>{node.name}</span>
        </div>
        {isExpanded && (
          <div className="tree-folder-children" role="group">
            {node.children.map((child) => (
              <FolderNode
                key={child.path}
                node={child}
                depth={depth + 1}
                activeFile={activeFile}
                onFileClick={onFileClick}
                validationResults={validationResults}
                editedFiles={editedFiles}
                searchQuery={searchQuery}
                streamingFile={streamingFile}
                plannedPaths={plannedPaths}
                generatedPaths={generatedPaths}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                focusedPath={focusedPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // File node
  const validation = validationResults[node.path];
  const isActive = activeFile === node.path;
  const isStreaming = streamingFile === node.path;
  const isPlanned = plannedPaths.has(node.path) && !generatedPaths.has(node.path);
  const isEdited = node.path in editedFiles;
  const isFocused = focusedPath === node.path;

  let statusCls = '';
  if (validation) {
    if (!validation.is_valid && validation.errors?.length > 0) statusCls = 'status-error';
    else if (validation.warnings?.length > 0) statusCls = 'status-warning';
  }

  const classNames = [
    'tree-file',
    isActive && 'active',
    isStreaming && 'streaming',
    isPlanned && 'planned',
    statusCls,
    isFocused && 'focused',
  ].filter(Boolean).join(' ');

  const iconCls = getFileIconClass(node.name);

  return (
    <div
      className={classNames}
      style={depthStyle}
      onClick={() => !isPlanned && onFileClick(node.path)}
      data-path={node.path}
      role="treeitem"
      aria-selected={isActive}
      aria-label={node.name}
      tabIndex={-1}
      title={
        validation
          ? `Valid: ${validation.is_valid}, Errors: ${validation.errors?.length || 0}`
          : isPlanned
          ? 'Planned — not yet generated'
          : undefined
      }
    >
      <span className={`tree-file-icon ${iconCls}`}>
        {getFileIcon(node.name)}
      </span>
      <span className="tree-file-name">
        {searchQuery ? highlightMatch(node.name, searchQuery) : node.name}
      </span>
      {isEdited && <span className="tree-file-modified" title="Modified">*</span>}
      {isStreaming && <span className="streaming-dot" />}
      {validation && !validation.is_valid && validation.errors?.length > 0 && (
        <span className="tree-file-status"><AlertCircle size={11} className="error-icon" /></span>
      )}
      {validation?.is_valid && (
        <span className="tree-file-status"><CheckCircle size={11} className="valid-icon" /></span>
      )}
    </div>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="search-highlight">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─── Main FileTree Component ─────────────────────────────────────────────────

export default function FileTree({ files, onFileClick, activeFile, validationResults = {}, editedFiles = {} }: FileTreeProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { streamingFile, generationPlan } = GenerationStore();

  const plannedPaths = useMemo(() => {
    const s = new Set<string>();
    generationPlan?.files?.forEach((f) => s.add(f.path));
    return s;
  }, [generationPlan]);

  const generatedPaths = useMemo(() => new Set(Object.keys(files)), [files]);

  const allPaths = useMemo(() => {
    const paths = new Set<string>();
    Object.keys(files).forEach((p) => paths.add(p));
    plannedPaths.forEach((p) => paths.add(p));
    return Array.from(paths);
  }, [files, plannedPaths]);

  const tree = useMemo(() => buildTree(allPaths), [allPaths]);

  useEffect(() => {
    const folders = new Set<string>();
    for (const p of allPaths) {
      const parts = p.split('/').filter(Boolean);
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join('/'));
      }
    }
    setExpandedFolders((prev) => {
      const merged = new Set(prev);
      folders.forEach((f) => merged.add(f));
      return merged;
    });
  }, [allPaths]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;
    const q = searchQuery.toLowerCase();

    const filterNodes = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.reduce<TreeNode[]>((acc, node) => {
        if (node.isFolder) {
          const filteredChildren = filterNodes(node.children);
          if (filteredChildren.length > 0) {
            acc.push({ ...node, children: filteredChildren });
          }
        } else if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
          acc.push(node);
        }
        return acc;
      }, []);
    };

    return filterNodes(tree);
  }, [tree, searchQuery]);

  const getAllVisiblePaths = useCallback((): string[] => {
    const paths: string[] = [];
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.isFolder) {
          paths.push(node.path);
          if (expandedFolders.has(node.path)) walk(node.children);
        } else {
          paths.push(node.path);
        }
      }
    };
    walk(filteredTree);
    return paths;
  }, [filteredTree, expandedFolders]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const visiblePaths = getAllVisiblePaths();
    if (visiblePaths.length === 0) return;

    const currentIdx = focusedPath ? visiblePaths.indexOf(focusedPath) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = currentIdx < visiblePaths.length - 1 ? currentIdx + 1 : 0;
      setFocusedPath(visiblePaths[next]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = currentIdx > 0 ? currentIdx - 1 : visiblePaths.length - 1;
      setFocusedPath(visiblePaths[prev]);
    } else if (e.key === 'Enter' && focusedPath) {
      e.preventDefault();
      const isFolder = expandedFolders.has(focusedPath) || filteredTree.some(
        (n) => n.isFolder && n.path === focusedPath
      );
      if (isFolder) {
        toggleFolder(focusedPath);
      } else if (!plannedPaths.has(focusedPath) || generatedPaths.has(focusedPath)) {
        onFileClick(focusedPath);
      }
    } else if (e.key === 'ArrowLeft' && focusedPath) {
      e.preventDefault();
      if (expandedFolders.has(focusedPath)) toggleFolder(focusedPath);
    } else if (e.key === 'ArrowRight' && focusedPath) {
      e.preventDefault();
      if (!expandedFolders.has(focusedPath)) toggleFolder(focusedPath);
    }
  }, [focusedPath, getAllVisiblePaths, expandedFolders, filteredTree, toggleFolder, plannedPaths, generatedPaths, onFileClick]);

  if (!files || typeof files !== 'object') {
    return (
      <div className="file-tree" role="tree" aria-label="Project files">
        <h3 className="file-tree-title"><FolderOpen size={16} />Project Files</h3>
        <p className="file-tree-empty">No files available</p>
      </div>
    );
  }

  if (allPaths.length === 0) {
    return (
      <div className="file-tree" role="tree" aria-label="Project files">
        <h3 className="file-tree-title"><FolderOpen size={16} />Project Files</h3>
        <p className="file-tree-empty">No files yet</p>
      </div>
    );
  }

  const fileCount = Object.keys(files).length;

  return (
    <div className="file-tree" ref={containerRef} onKeyDown={handleKeyDown} tabIndex={0} role="tree" aria-label="Project files">
      <h3 className="file-tree-title">
        <FolderOpen size={16} />
        Project Files
        <span className="file-count">
          {fileCount} file{fileCount !== 1 ? 's' : ''}
        </span>
      </h3>

      {/* Search */}
      <div className="file-tree-search">
        <Search size={12} />
        <input
          type="text"
          placeholder="Filter files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Filter files"
        />
      </div>

      {/* Tree */}
      <div className="files" role="group">
        {filteredTree.map((node) => (
          <FolderNode
            key={node.path}
            node={node}
            depth={0}
            activeFile={activeFile}
            onFileClick={onFileClick}
            validationResults={validationResults}
            editedFiles={editedFiles}
            searchQuery={searchQuery}
            streamingFile={streamingFile}
            plannedPaths={plannedPaths}
            generatedPaths={generatedPaths}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            focusedPath={focusedPath}
          />
        ))}
        {filteredTree.length === 0 && searchQuery && (
          <p className="file-tree-empty">No matches for &ldquo;{searchQuery}&rdquo;</p>
        )}
      </div>
    </div>
  );
}
