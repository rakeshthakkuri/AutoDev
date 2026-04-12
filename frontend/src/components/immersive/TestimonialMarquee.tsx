import { motion } from "framer-motion";

type Testimonial = {
  quote: string;
  name: string;
  role: string;
  initials: string;
  stars: number;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote: "Went from a rough idea to a polished landing page in under 5 minutes. The live preview is game-changing.",
    name: "Sarah Chen",
    role: "Founder, Stealth Startup",
    initials: "SC",
    stars: 5,
  },
  {
    quote: "Like having a senior frontend dev who never sleeps. Shipped our MVP demo for investor day in one afternoon.",
    name: "Marcus Rivera",
    role: "CTO, LaunchPad AI",
    initials: "MR",
    stars: 5,
  },
  {
    quote: "The multi-framework support is incredible. I prototype in React, then switch to Vue for the client. Seamless.",
    name: "Priya Kapoor",
    role: "Freelance Developer",
    initials: "PK",
    stars: 5,
  },
  {
    quote: "We use this for every hackathon now. Our team generates the scaffold, then customizes. We win more often.",
    name: "James O'Brien",
    role: "Lead Engineer, Buildkit",
    initials: "JO",
    stars: 5,
  },
  {
    quote: "As a designer who codes, this bridges the gap perfectly. I describe the vibe and get a working prototype.",
    name: "Aiko Tanaka",
    role: "Product Designer",
    initials: "AT",
    stars: 5,
  },
  {
    quote: "The streaming generation feels magical. Watching files appear in real-time keeps the creative momentum going.",
    name: "Daniel Park",
    role: "Staff Engineer, Verve",
    initials: "DP",
    stars: 5,
  },
];

function Stars({ count }: { count: number }) {
  return (
    <div className="testimonial-stars">
      {Array.from({ length: count }, (_, i) => (
        <span key={i}>&#9733;</span>
      ))}
    </div>
  );
}

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <div className="testimonial-card">
      <Stars count={t.stars} />
      <p className="testimonial-quote">&ldquo;{t.quote}&rdquo;</p>
      <div className="testimonial-author">
        <div className="testimonial-avatar">{t.initials}</div>
        <div className="testimonial-author-info">
          <span className="testimonial-name">{t.name}</span>
          <span className="testimonial-role">{t.role}</span>
        </div>
      </div>
    </div>
  );
}

function MarqueeRow({ testimonials }: { testimonials: Testimonial[] }) {
  const doubled = testimonials.concat(testimonials);
  return (
    <div className="marquee-track">
      {doubled.map((t, i) => (
        <TestimonialCard key={`${i}-${t.initials}`} t={t} />
      ))}
    </div>
  );
}

export default function TestimonialMarquee() {
  const firstRow = TESTIMONIALS.slice(0, 3);
  const secondRow = TESTIMONIALS.slice(3, 6);

  return (
    <section className="testimonial-marquee" aria-label="Testimonials">
      <div className="testimonial-section-header">
        <p>Trusted by builders</p>
        <h2>What developers are saying</h2>
      </div>
      <motion.div
        className="marquee-wrap"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.6 }}
      >
        <MarqueeRow testimonials={firstRow} />
      </motion.div>
      <motion.div
        className="marquee-wrap"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.6, delay: 0.15 }}
      >
        <MarqueeRow testimonials={secondRow} />
      </motion.div>
    </section>
  );
}
