import { motion } from "framer-motion";
import { parallaxFloat } from "../../lib/motion-system/variants";

type FeatureStripProps = {
  onSelectPrompt: (prompt: string) => void;
};

const CARDS = [
  {
    label: "SaaS launchpad",
    title: "Full-stack landing pages",
    body: "Hero sections, social proof, pricing tables, and testimonials — polished and conversion-ready in seconds.",
    prompt:
      "Create a cinematic SaaS landing page with hero, metrics, pricing and live product preview",
  },
  {
    label: "Dashboard",
    title: "Real-time command centers",
    body: "Analytics dashboards with charts, sidebar nav, dark mode, and keyboard-first navigation patterns.",
    prompt:
      "Build a modern analytics dashboard with command palette, dark mode and live-feel charts",
  },
  {
    label: "Portfolio",
    title: "Designer-grade portfolios",
    body: "Case study showcases with strong typography, smooth transitions, and clear conversion paths.",
    prompt:
      "Design a product designer portfolio with case studies, testimonials, and a clear contact CTA",
  },
];

export default function FeatureStrip({ onSelectPrompt }: FeatureStripProps) {
  return (
    <section className="feature-strip">
      <div className="feature-strip-inner">
        <div className="feature-strip-header">
          <p>Scenes the studio excels at</p>
          <h2>Prompt-native launchpads</h2>
        </div>
        <div className="feature-strip-track">
          {CARDS.map((card) => (
            <motion.button
              key={card.label}
              className="feature-strip-card"
              variants={parallaxFloat}
              initial="initial"
              whileInView="inView"
              viewport={{ once: true, margin: "-10%" }}
              onClick={() => onSelectPrompt(card.prompt)}
              whileHover={{ scale: 1.02, y: -4 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              data-cursor-hover
            >
              <span className="feature-strip-pill">{card.label}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}
