import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Code2, Zap, Box } from "lucide-react";
import { scaleReveal, staggerContainer, staggerItem } from "../../lib/motion-system/variants";

const ITEMS = [
  {
    icon: Code2,
    title: "Streaming generation",
    desc: "Watch every file appear character by character. Edit inline, preview the result instantly.",
  },
  {
    icon: Zap,
    title: "Any framework, one prompt",
    desc: "React, Vue, Svelte, Next.js, Angular, Astro, or plain HTML. You describe — we scaffold.",
  },
  {
    icon: Box,
    title: "One-click export",
    desc: "Download a production-ready ZIP with all files. Deploy to Vercel, Netlify, or anywhere.",
  },
];

export default function ProductReveal() {
  const navigate = useNavigate();

  return (
    <section className="product-reveal">
      <div className="product-reveal-spotlight" aria-hidden />
      <motion.div
        className="product-reveal-inner"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-10%" }}
        variants={scaleReveal}
      >
        <p className="product-reveal-kicker">The pipeline</p>
        <h2 className="product-reveal-heading">
          From idea to deploy in one flow.
        </h2>
        <motion.div
          className="product-reveal-grid"
          variants={staggerContainer(0.08)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-5%" }}
        >
          {ITEMS.map((item) => (
            <motion.div
              key={item.title}
              className="product-reveal-card"
              variants={staggerItem}
            >
              <div className="product-reveal-card-glow" />
              <item.icon className="product-reveal-card-icon" size={28} />
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </motion.div>
          ))}
        </motion.div>
        <motion.div
          className="product-reveal-cta-wrap"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <button
            className="product-reveal-cta"
            onClick={() => navigate("/generate")}
            data-cursor-hover
          >
            Start creating
          </button>
        </motion.div>
      </motion.div>
    </section>
  );
}
