# Immersive Landing Experience

This landing page is designed as an experience-first, cinematic surface for the AI code generator. It aims to feel like a product environment from a creative studio rather than a conventional SaaS homepage.

## Creative Direction

- Dark, cinematic base using deep blues and near-black surfaces.
- High-contrast typography with ultra-bold hero type and tight tracking.
- Glow, grain-like gradients and soft lighting to create depth instead of flat panels.
- Minimal copy; the visuals and motion carry most of the story.

The experience is structured as a sequence of scenes: a hero stage, a metric strip, a scroll-driven narrative, and a horizontal prompt runway.

## Layout and Narrative

- **Hero**: Fullscreen stage built around a particle field and a single bold statement. The headline is treated as a title card and the CTA reads as an entry into a studio rather than a generic “Get Started” button.
- **Metrics strip**: Four compact tiles summarise frameworks, generation, preview and export. Each tile reads like a capability badge for investors or technical evaluators.
- **Scroll story**: A three-column scene layout that explains the concept, blueprint and performance phases of the system. This replaces a traditional “How it works” section with something closer to storyboard frames.
- **Prompt runway**: A horizontal scroller of glassy prompt cards, plus a curated example grid. Both are designed as “prompt reels” you can click to immediately see the system in action.

## Motion System

- Motion primitives are defined centrally in `src/lib/motion-system/tokens.ts` and `src/lib/motion-system/variants.ts`.
- `framer-motion` is used for:
  - Hero entrance staging.
  - Text blur-to-crisp reveals.
  - Section-level fade and parallax.
  - Feature cards that float into view.
- Timings and easings favour soft curves over linear transitions to keep the motion feeling organic.

## Interaction Patterns

- **Custom cursor**: A screen-blend blob follows the pointer to add a premium, tactile feel on desktop without impacting usability.
- **Magnetic CTA**: The primary hero button uses a magnetic hover hook so it subtly follows the pointer and feels physically present.
- **Scroll storytelling**: Sections respond to scroll via parallax and opacity shifts, making the page feel like a sequence of scenes rather than static blocks.
- **Prompt triggers**: Feature cards and example tiles are fully clickable and route directly into `/?prompt=…` flows, tying the narrative to real product behaviour.

## Visual Systems

- Uses the existing design system tokens for spacing, typography and colour, but leans on:
  - Radial gradients for lighting.
  - Glassmorphism-style cards for depth.
  - High-radius shapes and border glows for a luxury tech aesthetic.
- The `HeroParticles` canvas layer creates ambient motion with cursor-reactive particles, simulating light beams and atmospheric dust without requiring a full 3D stack.

## Technical Architecture

- **Components**
  - `components/immersive/HeroCinematic.tsx` – hero stage and primary CTA.
  - `components/immersive/HeroParticles.tsx` – GPU-friendly canvas particle field.
  - `components/immersive/ScrollStorySection.tsx` – scroll-driven narrative section.
  - `components/immersive/FeatureStrip.tsx` – horizontal prompt runway.
  - `components/immersive/CustomCursor.tsx` – global custom cursor.
- **Hooks and motion**
  - `hooks/animation/useMagneticHover.ts` – reusable magnetic hover behaviour for buttons or cards.
  - `lib/motion-system/tokens.ts` – shared timings and easing constants.
  - `lib/motion-system/variants.ts` – Framer Motion variants for hero, sections and text.
- **Styling**
  - All immersive styles live in `src/styles/landing.css` alongside the existing landing styles, extending rather than replacing the core design system.

## Performance Considerations

- The particle field scales the number of particles based on viewport area and is rendered with a lightweight canvas loop.
- Heavy motion is scoped mainly to the hero and section entrances; the rest of the page relies on subtle transforms and opacity changes.
- The custom cursor is disabled on touch-sized viewports to reduce overhead and avoid conflicts with mobile interactions.

