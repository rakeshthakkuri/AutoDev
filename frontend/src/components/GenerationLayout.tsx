import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, FileCode, Eye } from 'lucide-react';

const PANEL_STORAGE_KEY = 'ai-gen-panel-widths';
const DEFAULT_LEFT = 260;
const DEFAULT_RIGHT = 420;

function loadPanelWidths(): { left: number; right: number } {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { left: parsed.left ?? DEFAULT_LEFT, right: parsed.right ?? DEFAULT_RIGHT };
    }
  } catch {
    /* ignore */
  }
  return { left: DEFAULT_LEFT, right: DEFAULT_RIGHT };
}

function savePanelWidths(left: number, right: number) {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ left, right }));
  } catch {
    /* ignore */
  }
}

export interface GenerationLayoutProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

export default function GenerationLayout({ left, center, right }: GenerationLayoutProps) {
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [panelWidths, setPanelWidths] = useState(loadPanelWidths);

  const isDragging = useRef<'left' | 'right' | null>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const startResize = useCallback((panel: 'left' | 'right', e: React.MouseEvent) => {
    isDragging.current = panel;
    dragStartX.current = e.clientX;
    dragStartWidth.current = panel === 'left' ? panelWidths.left : panelWidths.right;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [panelWidths]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - dragStartX.current;

      if (isDragging.current === 'left') {
        const newWidth = Math.max(180, Math.min(500, dragStartWidth.current + delta));
        setPanelWidths((prev) => ({ ...prev, left: newWidth }));
      } else {
        const newWidth = Math.max(250, Math.min(700, dragStartWidth.current - delta));
        setPanelWidths((prev) => ({ ...prev, right: newWidth }));
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setPanelWidths((prev) => {
          savePanelWidths(prev.left, prev.right);
          return prev;
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleDoubleClickResize = useCallback((panel: 'left' | 'right') => {
    const defaults = { left: DEFAULT_LEFT, right: DEFAULT_RIGHT };
    setPanelWidths((prev) => {
      const next = { ...prev, [panel]: defaults[panel] };
      savePanelWidths(next.left, next.right);
      return next;
    });
  }, []);

  const layoutStyle = {
    '--left-w': `${panelWidths.left}px`,
    '--right-w': `${panelWidths.right}px`,
  } as React.CSSProperties;

  return (
    <div className="generation-layout" style={layoutStyle}>
      {!leftPanelCollapsed && (
        <div className="left-panel" style={{ width: panelWidths.left, minWidth: 180, flexShrink: 0 }}>
          <div className="panel-header">
            <div className="panel-title">
              <FileCode size={15} />
              <span>Files</span>
            </div>
            <button
              type="button"
              className="panel-toggle"
              onClick={() => setLeftPanelCollapsed(true)}
              title="Collapse"
              aria-label="Collapse file panel"
            >
              <ChevronLeft size={14} />
            </button>
          </div>
          {left}
        </div>
      )}

      {leftPanelCollapsed && (
        <div className="collapsed-toggle">
          <button
            type="button"
            className="panel-toggle"
            onClick={() => setLeftPanelCollapsed(false)}
            title="Expand file panel"
            aria-label="Expand file panel"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {!leftPanelCollapsed && (
        <div
          className={`resize-handle ${isDragging.current === 'left' ? 'active' : ''}`}
          onMouseDown={(e) => startResize('left', e)}
          onDoubleClick={() => handleDoubleClickResize('left')}
          title="Drag to resize, double-click to reset"
        />
      )}

      <div className="center-panel" style={{ flex: 1, minWidth: 0 }}>
        {center}
      </div>

      {!rightPanelCollapsed && (
        <div
          className={`resize-handle ${isDragging.current === 'right' ? 'active' : ''}`}
          onMouseDown={(e) => startResize('right', e)}
          onDoubleClick={() => handleDoubleClickResize('right')}
          title="Drag to resize, double-click to reset"
        />
      )}

      {!rightPanelCollapsed && (
        <div className="right-panel" style={{ width: panelWidths.right, minWidth: 250, flexShrink: 0 }}>
          <div className="panel-header">
            <div className="panel-title">
              <Eye size={15} />
              <span>Live Preview</span>
            </div>
            <button
              type="button"
              className="panel-toggle"
              onClick={() => setRightPanelCollapsed(true)}
              title="Collapse"
              aria-label="Collapse preview panel"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          {right}
        </div>
      )}

      {rightPanelCollapsed && (
        <div className="collapsed-toggle">
          <button
            type="button"
            className="panel-toggle"
            onClick={() => setRightPanelCollapsed(false)}
            title="Expand preview panel"
            aria-label="Expand preview panel"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
