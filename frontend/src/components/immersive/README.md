# Immersive Landing — Creative Decisions

This folder contains the **cinematic landing experience**: an experience-first, premium, Awwwards-grade front door for the AI Project Generator.

## Design Philosophy

1. **Experience > Information** — Scroll is a narrative; each section is a “scene” with depth and motion.
2. **Motion as storytelling** — Blur reveals, parallax, and staggered entrances guide the eye and create rhythm.
3. **Dark, premium aesthetic** — Deep black base (#050508), electric blue/violet accents, soft gradients and glassmorphism.
4. **Minimal words, maximum impact** — Headlines are short and bold; body copy is supportive, not dominant.

## Architecture

```
components/immersive/
├── CustomCursor.tsx    # Blob cursor, magnetic follow, ripple on click, hover scale
├── GrainOverlay.tsx   # Film grain canvas overlay (respects reduced motion)
├── HeroCinematic.tsx   # Fullscreen hero, particles, gradient, CTA, scroll indicator
├── HeroParticles.tsx  # Cursor-reactive particle field (canvas 2D)
├── ScrollStorySection.tsx  # Parallax story with 01/02/03 columns
├── FeatureStrip.tsx   # Horizontal scroll strip, glass cards, magnetic CTA
├── ProductReveal.tsx  # Spotlight section, 3-card grid, “Start creating” CTA
├── TestimonialMarquee.tsx  # Auto-scrolling quote marquee (reduced-motion safe)
├── NavOverlay.tsx     # Fullscreen overlay menu (mobile hamburger)
└── README.md          # This file
```

## Motion System

- **Tokens** (`lib/motion-system/tokens.ts`): Durations, easings (expo, elastic), stagger, blur values.
- **Variants** (`lib/motion-system/variants.ts`): Hero container/item, blur reveal, parallax float, stagger container/item, scale reveal, section reveal.
- **Hooks**: `useMagneticHover` (CTA/buttons), `useSmoothScroll` (Lenis on landing).

Lenis is used only on the landing route for inertia-style smooth scrolling; it is destroyed on navigate away.

## Key UX Decisions

- **Custom cursor**: Disabled on touch (max-width 768px) to avoid conflicts with native touch.
- **Hero**: Full viewport height, Syne for the main headline, gradient text on “web universes”, scroll indicator at bottom.
- **Nav**: Floating minimal bar on landing; on mobile, hamburger opens fullscreen NavOverlay with Home / Enter studio / History.
- **Sections**: Story (parallax + numbered columns), Feature strip (horizontal scroll + glass cards), Product reveal (spotlight + 3 cards), Marquee (cinematic social proof), then prompt reels and footer.

## Performance

- Particle count is capped and reduced on `prefers-reduced-motion`.
- Grain overlay skips animation when `prefers-reduced-motion: reduce`.
- Lenis is not used on /generate to avoid conflicts with the app’s scroll context.

## Typography

- **Hero title**: Syne (800/900) for an editorial, high-end feel.
- **Body / UI**: Outfit (existing) for consistency with the rest of the app.

## Colors

- Base: `#050508` (near black).
- Accents: blue/violet/cyan gradients (e.g. `#38bdf8`, `#818cf8`, `#22d3ee`).
- Glass: `rgba(15, 23, 42, 0.5–0.7)` with backdrop-filter and subtle borders.

This creates a product experience that feels like a $100k design studio landing: cinematic, immersive, and investor-grade.
