import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Atom, Hexagon, Flame, Triangle } from "lucide-react";
import Navbar from "./Navbar";
import ProjectHistorySidebar from "./ProjectHistorySidebar";
import { GenerationStore } from "../store/generation";
import { ProjectData } from "../services/storage";
import CustomCursor from "./immersive/CustomCursor";
import GrainOverlay from "./immersive/GrainOverlay";
import HeroCinematic from "./immersive/HeroCinematic";
import ScrollStorySection from "./immersive/ScrollStorySection";
import FeatureStrip from "./immersive/FeatureStrip";
import ProductReveal from "./immersive/ProductReveal";
import TestimonialMarquee from "./immersive/TestimonialMarquee";
import NavOverlay from "./immersive/NavOverlay";
import { useSmoothScroll } from "../hooks/animation/useSmoothScroll";

const FRAMEWORK_EXAMPLES = [
  {
    prompt:
      "Create a modern SaaS landing page with hero, features, pricing, and testimonials",
    framework: "React",
    Icon: Atom,
  },
  {
    prompt: "Build a Vue.js dashboard with sidebar navigation, charts, and dark mode",
    framework: "Vue",
    Icon: Hexagon,
  },
  {
    prompt: "Make a Svelte todo app with categories, drag-and-drop, and local storage",
    framework: "Svelte",
    Icon: Flame,
  },
  {
    prompt: "Create a Next.js blog with Tailwind CSS, markdown support, and search",
    framework: "Next.js",
    Icon: Triangle,
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const confirmDiscardChanges = GenerationStore((s) => s.confirmDiscardChanges);
  const loadProjectState = GenerationStore((s) => s.loadProject);

  useSmoothScroll(true);

  useEffect(() => {
    const openHistory = () => {
      setIsMenuOpen(false);
      setIsHistoryOpen(true);
    };
    window.addEventListener("open-history", openHistory);
    return () => window.removeEventListener("open-history", openHistory);
  }, []);

  const handleGetStarted = () => navigate("/generate");

  const handleLoadProject = (project: ProjectData) => {
    if (
      !confirmDiscardChanges(
        "You have unsaved changes. Loading will discard them. Continue?"
      )
    )
      return;
    loadProjectState(project.files, project.editedFiles, project.prompt);
    navigate("/generate");
  };

  const handlePromptSelect = (prompt: string) => {
    navigate(`/generate?prompt=${encodeURIComponent(prompt)}`);
  };

  return (
    <div className="app immersive-root">
      <CustomCursor />
      <GrainOverlay />
      <Navbar
        onHistoryOpen={() => setIsHistoryOpen(true)}
        onMenuOpen={() => setIsMenuOpen(true)}
      />
      <NavOverlay
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
      />
      <ProjectHistorySidebar
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onLoadProject={handleLoadProject}
      />

      <main className="immersive-page">
        <HeroCinematic onPrimaryClick={handleGetStarted} />

        <section className="immersive-metrics">
          <div className="immersive-metric">
            <span className="immersive-metric-label">Frameworks</span>
            <span className="immersive-metric-value">8+</span>
          </div>
          <div className="immersive-metric">
            <span className="immersive-metric-label">Generation</span>
            <span className="immersive-metric-value">Real‑time</span>
          </div>
          <div className="immersive-metric">
            <span className="immersive-metric-label">Preview</span>
            <span className="immersive-metric-value">Instant</span>
          </div>
          <div className="immersive-metric">
            <span className="immersive-metric-label">Deploy</span>
            <span className="immersive-metric-value">1‑Click</span>
          </div>
        </section>

        <ScrollStorySection />
        <FeatureStrip onSelectPrompt={handlePromptSelect} />
        <ProductReveal />
        <TestimonialMarquee />

        <section className="immersive-examples">
          <div className="immersive-examples-header">
            <p>Jump directly into generation</p>
            <h2>Curated prompt reels</h2>
          </div>
          <div className="examples-grid">
            {FRAMEWORK_EXAMPLES.map((example, index) => (
              <button
                key={index}
                className="example-card"
                onClick={() => handlePromptSelect(example.prompt)}
                data-cursor-hover
              >
                <div className="example-icon">
                  <example.Icon size={18} />
                </div>
                <div className="example-card-body">
                  <div className="example-framework-label">
                    {example.framework}
                  </div>
                  <p>{example.prompt}</p>
                </div>
                <ArrowRight size={16} className="example-arrow" />
              </button>
            ))}
          </div>
        </section>

        <footer className="landing-footer">
          <p>Describe it. Generate it. Ship it.</p>
          <div className="footer-links">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <span className="footer-separator">·</span>
            <span className="footer-hint">
              Press{" "}
              {navigator.platform.toUpperCase().includes("MAC") ? "⌘" : "Ctrl"}+K
              for shortcuts
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
