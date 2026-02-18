import { useState, useEffect, useCallback, useRef } from 'react';
import { Wand2, History, Cpu, FileCode, Atom, Triangle, Hexagon, Flame, Shield, Rocket } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { GenerationStore } from '../store/generation';

// ─── Framework & Styling Options ─────────────────────────────────────────────

interface FrameworkOption {
  value: string;
  label: string;
  Icon: LucideIcon;
}

const FRAMEWORK_OPTIONS: FrameworkOption[] = [
  { value: 'auto', label: 'Auto-Detect', Icon: Cpu },
  { value: 'vanilla-js', label: 'Vanilla JS', Icon: FileCode },
  { value: 'react', label: 'React', Icon: Atom },
  { value: 'react-ts', label: 'React + TS', Icon: Atom },
  { value: 'nextjs', label: 'Next.js', Icon: Triangle },
  { value: 'vue', label: 'Vue', Icon: Hexagon },
  { value: 'svelte', label: 'Svelte', Icon: Flame },
  { value: 'angular', label: 'Angular', Icon: Shield },
  { value: 'astro', label: 'Astro', Icon: Rocket },
];

const STYLING_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'tailwind', label: 'Tailwind CSS' },
  { value: 'plain-css', label: 'Plain CSS' },
  { value: 'css-modules', label: 'CSS Modules' },
  { value: 'scss', label: 'SCSS' },
];

const COMPLEXITY_OPTIONS = [
  { value: 'simple', label: 'Simple', desc: '3-5 files' },
  { value: 'intermediate', label: 'Standard', desc: '5-10 files' },
  { value: 'advanced', label: 'Advanced', desc: '8-20 files' },
];

// ─── Framework-Specific Prompt Templates ─────────────────────────────────────

const FRAMEWORK_TEMPLATES: Record<string, string[]> = {
  auto: [
    "Create a modern landing page with hero section, features, and pricing",
    "Build a task manager with add, edit, delete, and filtering",
    "Make a portfolio website with project gallery and contact form",
  ],
  'vanilla-js': [
    "Build a weather app that fetches and displays current conditions with a clean UI",
    "Create a quiz game with multiple choice questions and a score tracker",
    "Make a Pomodoro timer with customizable intervals and notifications",
  ],
  react: [
    "Build a React dashboard with sidebar navigation, charts, and data tables",
    "Create a React e-commerce product page with cart, filters, and ratings",
    "Make a React social media feed with infinite scroll and like/comment",
  ],
  'react-ts': [
    "Build a TypeScript React project management board with drag-and-drop columns",
    "Create a React TypeScript form builder with validation and preview",
    "Make a React+TS real-time chat interface with message history",
  ],
  nextjs: [
    "Create a Next.js blog with Tailwind, markdown rendering, and search",
    "Build a Next.js portfolio with page transitions and dark mode toggle",
    "Make a Next.js SaaS landing with pricing, FAQs, and newsletter signup",
  ],
  vue: [
    "Build a Vue.js dashboard with sidebar, data visualization, and dark mode",
    "Create a Vue recipe app with search, favorites, and ingredient filters",
    "Make a Vue.js kanban board with drag-and-drop and local storage persistence",
  ],
  svelte: [
    "Build a Svelte todo app with categories, drag-and-drop, and animations",
    "Create a Svelte weather dashboard with location search and 5-day forecast",
    "Make a Svelte music player with playlist management and progress bar",
  ],
  angular: [
    "Build an Angular admin dashboard with data tables, charts, and auth layout",
    "Create an Angular task tracker with services, pipes, and reactive forms",
    "Make an Angular e-commerce storefront with routing, cart, and checkout flow",
  ],
  astro: [
    "Build an Astro documentation site with sidebar navigation and search",
    "Create an Astro blog with RSS feed, tags, and reading time",
    "Make an Astro portfolio with project showcase and contact section",
  ],
};

// ─── Prompt History ──────────────────────────────────────────────────────────

const HISTORY_KEY = 'ai-gen-prompt-history';
const MAX_HISTORY = 10;

function getPromptHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveToHistory(prompt: string) {
  try {
    const history = getPromptHistory().filter((p) => p !== prompt);
    history.unshift(prompt);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch { /* ignore */ }
}

// ─── Prompt Strength ─────────────────────────────────────────────────────────

function getPromptStrength(text: string): { level: string; label: string } {
  const len = text.trim().length;
  if (len === 0) return { level: '', label: '' };
  if (len < 30) return { level: 'weak', label: 'Too short — add more detail' };
  if (len < 60) return { level: 'fair', label: 'Fair — try being more specific' };
  if (len < 200) return { level: 'good', label: 'Good prompt length' };
  return { level: 'great', label: 'Very detailed prompt' };
}

// ─── Component ───────────────────────────────────────────────────────────────

interface PromptInputProps {
  onGenerate?: (prompt: string) => void;
  initialValue?: string;
}

export default function PromptInput({ onGenerate, initialValue = '' }: PromptInputProps) {
  const [prompt, setPrompt] = useState(initialValue);
  const { generateProject, isGenerating, selectedFramework, selectedStyling, selectedComplexity, setSelectedFramework, setSelectedStyling, setSelectedComplexity } = GenerationStore();
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialValue && !prompt) {
      setPrompt(initialValue);
    }
  }, [initialValue]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleGenerate = useCallback(() => {
    if (prompt.trim() && !isGenerating) {
      saveToHistory(prompt.trim());
      onGenerate?.(prompt);
      generateProject(prompt);
    }
  }, [prompt, isGenerating, onGenerate, generateProject]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  }, [handleGenerate]);

  const currentFramework = FRAMEWORK_OPTIONS.find(f => f.value === selectedFramework) || FRAMEWORK_OPTIONS[0];
  const templates = FRAMEWORK_TEMPLATES[selectedFramework] || FRAMEWORK_TEMPLATES.auto;
  const history = getPromptHistory();
  const strength = getPromptStrength(prompt);

  return (
    <div className="prompt-input">
      <h2>What do you want to build?</h2>

      {/* ── Framework Selector Chips ── */}
      <div className="framework-selector">
        <div className="selector-label">Framework</div>
        <div className="framework-chips" role="radiogroup" aria-label="Select framework">
          {FRAMEWORK_OPTIONS.map(fw => (
            <button
              key={fw.value}
              type="button"
              role="radio"
              aria-checked={selectedFramework === fw.value}
              className={`framework-chip ${selectedFramework === fw.value ? 'active' : ''}`}
              onClick={() => setSelectedFramework(fw.value)}
              disabled={isGenerating}
              title={fw.label}
            >
              <span className="chip-icon"><fw.Icon size={14} /></span>
              <span className="chip-label">{fw.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Styling & Complexity (always visible) ── */}
      <div className="options-row">
        <div className="option-group">
          <label>Styling</label>
          <div className="option-chips">
            {STYLING_OPTIONS.map(s => (
              <button key={s.value} type="button" className={`option-chip ${selectedStyling === s.value ? 'active' : ''}`} onClick={() => setSelectedStyling(s.value)} disabled={isGenerating}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="option-group">
          <label>Complexity</label>
          <div className="option-chips">
            {COMPLEXITY_OPTIONS.map(c => (
              <button key={c.value} type="button" className={`option-chip ${selectedComplexity === c.value ? 'active' : ''}`} onClick={() => setSelectedComplexity(c.value)} disabled={isGenerating}>
                {c.label}
                <span className="chip-desc">{c.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Prompt Textarea ── */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Describe your project... (${currentFramework.label})\n\nTip: Be specific about features, pages, and interactions you want.`}
        rows={5}
        disabled={isGenerating}
        aria-label="Project description"
      />

      {/* Prompt strength indicator */}
      {strength.level && (
        <div className="prompt-strength">
          <div className="prompt-strength-bar">
            <div className={`prompt-strength-fill ${strength.level}`} />
          </div>
          <span className={`prompt-strength-label ${strength.level}`}>{strength.label}</span>
        </div>
      )}

      <div className="prompt-actions">
        <button
          className="generate-btn"
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          aria-label="Generate project"
        >
          <Wand2 size={18} />
          {isGenerating ? 'Generating...' : 'Generate Project'}
        </button>
        <span className="shortcut-hint">{navigator.platform.toUpperCase().includes('MAC') ? '⌘' : 'Ctrl'} + Enter</span>

        {/* Prompt history */}
        {history.length > 0 && (
          <div className="prompt-history" ref={historyRef}>
            <button
              type="button"
              className="prompt-history-btn"
              onClick={() => setShowHistory(!showHistory)}
              aria-label="Prompt history"
              aria-expanded={showHistory}
            >
              <History size={13} />
              History
            </button>
            {showHistory && (
              <div className="prompt-history-dropdown">
                {history.map((h, i) => (
                  <div
                    key={i}
                    className="prompt-history-item"
                    onClick={() => {
                      setPrompt(h);
                      setShowHistory(false);
                    }}
                    title={h}
                  >
                    {h}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Framework-Specific Examples ── */}
      <div className="examples">
        <p>Try an example for {currentFramework.label}:</p>
        {templates.map((ex, i) => (
          <button
            key={i}
            type="button"
            className="example"
            onClick={() => setPrompt(ex)}
            disabled={isGenerating}
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
