import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Code, Zap, Rocket, ArrowRight, Github, Atom, Hexagon, Flame, Triangle, Shield, FileCode } from 'lucide-react';
import Navbar from './Navbar';
import ProjectHistorySidebar from './ProjectHistorySidebar';
import { GenerationStore } from '../store/generation';
import { ProjectData } from '../services/storage';

// ─── Framework Showcase Data ─────────────────────────────────────────────────

const FRAMEWORKS = [
  { name: 'React', Icon: Atom, color: '#61dafb' },
  { name: 'Vue', Icon: Hexagon, color: '#42b883' },
  { name: 'Svelte', Icon: Flame, color: '#ff3e00' },
  { name: 'Next.js', Icon: Triangle, color: '#ffffff' },
  { name: 'Angular', Icon: Shield, color: '#dd0031' },
  { name: 'Astro', Icon: Rocket, color: '#ff5d01' },
  { name: 'Vanilla JS', Icon: FileCode, color: '#f7df1e' },
  { name: 'TypeScript', Icon: Code, color: '#3178c6' },
];

// ─── Typewriter Code Samples ─────────────────────────────────────────────────

const CODE_LINES = [
  { text: 'import ', cls: 'tw-keyword' },
  { text: 'React', cls: 'tw-func' },
  { text: ' from ', cls: 'tw-keyword' },
  { text: "'react'", cls: 'tw-string' },
  { text: ';\n\n', cls: '' },
  { text: 'export default function ', cls: 'tw-keyword' },
  { text: 'App', cls: 'tw-func' },
  { text: '() {\n  return (\n    ', cls: '' },
  { text: '<div ', cls: 'tw-tag' },
  { text: 'className', cls: 'tw-attr' },
  { text: '=', cls: '' },
  { text: '"app"', cls: 'tw-string' },
  { text: '>\n      ', cls: 'tw-tag' },
  { text: '<h1>', cls: 'tw-tag' },
  { text: 'Hello World', cls: '' },
  { text: '</h1>', cls: 'tw-tag' },
  { text: '\n    ', cls: '' },
  { text: '</div>', cls: 'tw-tag' },
  { text: '\n  );\n}', cls: '' },
];

function TypewriterAnimation() {
  const [displayed, setDisplayed] = useState<{ text: string; cls: string }[]>([]);
  const [charIdx, setCharIdx] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setLineIdx((li) => {
        if (li >= CODE_LINES.length) {
          setTimeout(() => {
            setDisplayed([]);
            setCharIdx(0);
            setLineIdx(0);
          }, 2000);
          clearInterval(intervalRef.current);
          return li;
        }

        const currentLine = CODE_LINES[li];

        setCharIdx((ci) => {
          const nextCi = ci + 1;
          if (nextCi > currentLine.text.length) {
            setDisplayed((prev) => [...prev, { text: currentLine.text, cls: currentLine.cls }]);
            setLineIdx(li + 1);
            return 0;
          }
          return nextCi;
        });

        return li;
      });
    }, 35);

    return () => clearInterval(intervalRef.current);
  }, []);

  const currentPartial = lineIdx < CODE_LINES.length
    ? { text: CODE_LINES[lineIdx].text.slice(0, charIdx), cls: CODE_LINES[lineIdx].cls }
    : null;

  return (
    <div className="typewriter-container">
      <div className="typewriter-header">
        <span className="typewriter-filename">App.jsx</span>
      </div>
      <pre className="typewriter-body">
        {displayed.map((d, i) => (
          <span key={i} className={d.cls}>{d.text}</span>
        ))}
        {currentPartial && <span className={currentPartial.cls}>{currentPartial.text}</span>}
        <span className="typewriter-cursor" />
      </pre>
    </div>
  );
}

// ─── Framework-Specific Examples ─────────────────────────────────────────────

const FRAMEWORK_EXAMPLES = [
  { prompt: "Create a modern SaaS landing page with hero, features, pricing, and testimonials", framework: 'React', Icon: Atom },
  { prompt: "Build a Vue.js dashboard with sidebar navigation, charts, and dark mode", framework: 'Vue', Icon: Hexagon },
  { prompt: "Make a Svelte todo app with categories, drag-and-drop, and local storage", framework: 'Svelte', Icon: Flame },
  { prompt: "Create a Next.js blog with Tailwind CSS, markdown support, and search", framework: 'Next.js', Icon: Triangle },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const hasUnsavedChanges = GenerationStore((s) => s.hasUnsavedChanges);
  const loadProjectState = GenerationStore((s) => s.loadProject);

  const features = [
    { icon: <Code size={20} />, title: 'Multi-Framework AI', description: 'Generate React, Vue, Svelte, Next.js, Angular, Astro, and more with framework-specific best practices' },
    { icon: <Zap size={20} />, title: 'Streaming Generation', description: 'Watch code appear in real-time as AI writes each file with live syntax highlighting' },
    { icon: <Rocket size={20} />, title: 'Instant Preview', description: 'See your project come to life with automatic bundling and live preview in the browser' },
  ];

  const handleGetStarted = () => navigate('/generate');

  const handleLoadProject = (project: ProjectData) => {
    if (hasUnsavedChanges()) {
      if (!window.confirm('You have unsaved changes. Loading will discard them. Continue?')) return;
    }
    loadProjectState(project.files, project.editedFiles, project.prompt);
    navigate('/generate');
  };

  return (
    <div className="app">
      <Navbar onHistoryOpen={() => setIsHistoryOpen(true)} />
      <ProjectHistorySidebar isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} onLoadProject={handleLoadProject} />

      <div className="landing-page">
        <div className="landing-hero">
          <div className="hero-content">
            <div className="hero-badge">
              <Sparkles size={14} />
              <span>Powered by AI</span>
            </div>

            <h1 className="hero-title">
              Build <span className="gradient-text">Web Projects</span>
              <br />
              with Natural Language
            </h1>

            <p className="hero-description">
              Describe what you want to build, and watch as AI generates a complete,
              working web application in seconds. Supports 8 frameworks out of the box.
            </p>

            <div className="hero-actions">
              <button onClick={handleGetStarted} className="btn-primary-large">
                Get Started
                <ArrowRight size={18} />
              </button>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary-large"
              >
                <Github size={18} />
                View on GitHub
              </a>
            </div>

            {/* Framework Showcase */}
            <div className="frameworks-showcase">
              {FRAMEWORKS.map((fw) => (
                <div key={fw.name} className="framework-showcase-item">
                  <div className="framework-showcase-icon">
                    <fw.Icon size={18} color={fw.color} />
                  </div>
                  <span className="framework-showcase-name">{fw.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Typewriter Animation */}
        <div className="typewriter-wrapper">
          <TypewriterAnimation />
        </div>

        {/* Features */}
        <div className="landing-features">
          <h2 className="section-title">Why Choose AI Code Generator?</h2>
          <div className="features-grid">
            {features.map((feature, index) => (
              <div key={index} className="feature-card">
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Framework-Specific Examples */}
        <div className="landing-examples">
          <h2 className="section-title">Try These Examples</h2>
          <div className="examples-grid">
            {FRAMEWORK_EXAMPLES.map((example, index) => (
              <div
                key={index}
                className="example-card"
                onClick={() => navigate(`/generate?prompt=${encodeURIComponent(example.prompt)}`)}
              >
                <div className="example-icon">
                  <example.Icon size={16} />
                </div>
                <div className="example-card-body">
                  <div className="example-framework-label">{example.framework}</div>
                  <p>{example.prompt}</p>
                </div>
                <ArrowRight size={14} className="example-arrow" />
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="landing-footer">
          <p>Built with React, TypeScript, and AI</p>
          <div className="footer-links">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
            <span className="footer-separator">·</span>
            <span className="footer-hint">Press {navigator.platform.toUpperCase().includes('MAC') ? '⌘' : 'Ctrl'}+K for shortcuts</span>
          </div>
        </div>
      </div>
    </div>
  );
}
