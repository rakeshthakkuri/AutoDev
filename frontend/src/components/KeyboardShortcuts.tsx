import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Keyboard } from 'lucide-react';

interface Shortcut {
  id: string;
  label: string;
  keys: string[];
  action?: () => void;
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
const MOD = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS: Shortcut[] = [
  { id: 'generate', label: 'Generate project', keys: [MOD, 'Enter'] },
  { id: 'save', label: 'Save project', keys: [MOD, 'S'] },
  { id: 'new', label: 'New project', keys: [MOD, 'N'] },
  { id: 'focus-prompt', label: 'Focus prompt input', keys: [MOD, 'Shift', 'P'] },
  { id: 'command-palette', label: 'Open command palette', keys: [MOD, 'K'] },
  { id: 'close', label: 'Close modal / panel', keys: ['Esc'] },
  { id: 'save-file', label: 'Save file edits', keys: [MOD, 'S'] },
  { id: 'revert-file', label: 'Revert file edits', keys: [MOD, 'Z'] },
  { id: 'tree-nav', label: 'Navigate file tree', keys: ['↑', '↓'] },
  { id: 'tree-expand', label: 'Expand / collapse folder', keys: ['→', '←'] },
  { id: 'tree-open', label: 'Open selected file', keys: ['Enter'] },
];

export default function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setSearch('');
        setActiveIndex(0);
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = search.trim()
    ? SHORTCUTS.filter((s) => s.label.toLowerCase().includes(search.toLowerCase()))
    : SHORTCUTS;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter' && filtered[activeIndex]) {
      e.preventDefault();
      filtered[activeIndex].action?.();
      setIsOpen(false);
    }
  }, [filtered, activeIndex]);

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={() => setIsOpen(false)}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown} role="dialog" aria-label="Keyboard shortcuts">
        <div className="command-palette-input">
          <Search size={14} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search shortcuts..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setActiveIndex(0); }}
            aria-label="Search shortcuts"
          />
          <kbd className="palette-esc-hint">esc</kbd>
        </div>

        <div className="command-palette-list">
          {filtered.length > 0 ? (
            filtered.map((shortcut, idx) => (
              <div
                key={shortcut.id}
                className={`command-palette-item ${idx === activeIndex ? 'active' : ''}`}
                onClick={() => {
                  shortcut.action?.();
                  setIsOpen(false);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <span className="command-palette-item-label">
                  <Keyboard size={13} />
                  {shortcut.label}
                </span>
                <span className="command-palette-item-shortcut">
                  {shortcut.keys.map((key, i) => (
                    <kbd key={i}>{key}</kbd>
                  ))}
                </span>
              </div>
            ))
          ) : (
            <div className="command-palette-empty">No shortcuts found for &ldquo;{search}&rdquo;</div>
          )}
        </div>

        <div className="command-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> select</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
