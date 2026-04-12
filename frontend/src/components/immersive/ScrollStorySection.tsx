import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import {
  blurRevealText,
  fadeInUpSection,
  staggerContainer,
  staggerItem,
} from "../../lib/motion-system/variants";

export default function ScrollStorySection() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const backgroundOpacity = useTransform(
    scrollYProgress,
    [0, 0.35, 0.7, 1],
    [0.15, 0.85, 0.9, 0.3]
  );
  const foregroundY = useTransform(scrollYProgress, [0, 0.5, 1], [60, -20, -50]);
  const scale = useTransform(scrollYProgress, [0, 0.25], [0.98, 1]);

  return (
    <section className="story-section" ref={containerRef}>
      <motion.div
        className="story-section-background"
        style={{ opacity: backgroundOpacity, y: foregroundY }}
      />
      <motion.div
        className="story-section-inner"
        style={{ scale }}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-15%" }}
        variants={fadeInUpSection}
      >
        <motion.p className="story-kicker" variants={blurRevealText}>
          How it works
        </motion.p>
        <motion.h2 className="story-heading" variants={blurRevealText}>
          From a single prompt to a living, breathing app.
        </motion.h2>

        <motion.div
          className="story-columns"
          variants={staggerContainer(0.1)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-5%" }}
        >
          <motion.div className="story-column" variants={staggerItem}>
            <span className="story-column-number">01</span>
            <h3>Describe</h3>
            <p>
              Write a natural-language prompt with your app idea, audience,
              and desired feel. The AI understands context, not just keywords.
            </p>
          </motion.div>
          <motion.div className="story-column" variants={staggerItem}>
            <span className="story-column-number">02</span>
            <h3>Generate</h3>
            <p>
              A planning agent maps the architecture, then streams every file
              in real time — routes, components, styles, and logic.
            </p>
          </motion.div>
          <motion.div className="story-column" variants={staggerItem}>
            <span className="story-column-number">03</span>
            <h3>Ship</h3>
            <p>
              Preview the result live, edit any file inline, then
              download a production-ready ZIP and deploy anywhere.
            </p>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
