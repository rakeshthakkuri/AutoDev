/**
 * Motion tokens — premium cinematic language.
 * Organic curves, luxury timing, Awwwards-grade feel.
 */

export const motionDurations = {
  xs: 0.16,
  sm: 0.22,
  md: 0.4,
  lg: 0.7,
  xl: 1,
  xxl: 1.4,
} as const;

export const motionEasings = {
  out: [0.16, 1, 0.3, 1] as const,
  inOut: [0.83, 0, 0.17, 1] as const,
  spring: [0.34, 1.56, 0.64, 1] as const,
  elastic: [0.68, -0.55, 0.265, 1.55] as const,
  smooth: [0.4, 0, 0.2, 1] as const,
  expoOut: [0.19, 1, 0.22, 1] as const,
} as const;

export const motionStagger = {
  hero: 0.06,
  section: 0.08,
  grid: 0.05,
  list: 0.04,
} as const;

export const motionOpacity = {
  muted: 0.4,
  soft: 0.7,
  hidden: 0,
} as const;

/** Blur values for text/asset reveals */
export const motionBlur = {
  in: "12px",
  out: "0px",
} as const;

/** Perspective for depth (px) */
export const motionPerspective = {
  near: 800,
  mid: 1200,
  far: 2000,
} as const;
