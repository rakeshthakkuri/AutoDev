import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import HeroParticles from "./HeroParticles";
import AuroraBackground from "./AuroraBackground";
import {
  heroContainerVariants,
  heroItemVariants,
} from "../../lib/motion-system/variants";
import { useMagneticHover } from "../../hooks/animation/useMagneticHover";

type HeroCinematicProps = {
  onPrimaryClick: () => void;
};

export default function HeroCinematic({ onPrimaryClick }: HeroCinematicProps) {
  const primaryRef = useMagneticHover<HTMLButtonElement>();

  return (
    <section className="immersive-hero" data-fullscreen>
      <AuroraBackground />
      <HeroParticles />
      <div className="immersive-hero-gradient" />
      <div className="immersive-hero-noise" aria-hidden />

      <motion.div
        className="immersive-hero-inner"
        initial="hidden"
        animate="visible"
        variants={heroContainerVariants}
      >
        <motion.div
          className="immersive-hero-badge"
          variants={heroItemVariants}
        >
          <Sparkles size={14} />
          <span>AI-powered code studio</span>
        </motion.div>

        <motion.h1 className="immersive-hero-title" variants={heroItemVariants}>
          Ship entire
          <span className="immersive-hero-highlight"> web universes</span>
          <br />
          from a single prompt.
        </motion.h1>

        <motion.p
          className="immersive-hero-subtitle"
          variants={heroItemVariants}
        >
          Describe what you want. Watch real code stream into existence.
          Preview, edit, and export — all in one flow.
        </motion.p>

        <motion.div
          className="immersive-hero-actions"
          variants={heroItemVariants}
        >
          <button
            ref={primaryRef}
            className="immersive-cta-primary"
            onClick={onPrimaryClick}
            data-cursor-hover
          >
            Start creating
            <ArrowRight size={18} />
          </button>
          <div className="immersive-cta-hint">
            <span className="immersive-cta-hint-line" />
            <span>Scroll to explore</span>
          </div>
        </motion.div>
      </motion.div>

      <div className="immersive-hero-scroll-indicator" aria-hidden>
        <motion.span
          animate={{ y: [0, 6, 0] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: [0.4, 0, 0.2, 1],
          }}
        >
          ↓
        </motion.span>
      </div>
    </section>
  );
}
