import type { Variants } from "framer-motion";
import {
  motionDurations,
  motionEasings,
  motionStagger,
  motionOpacity,
  motionBlur,
} from "./tokens";

export const heroContainerVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: motionDurations.lg,
      ease: motionEasings.expoOut,
      when: "beforeChildren",
      staggerChildren: motionStagger.hero,
    },
  },
};

export const heroItemVariants: Variants = {
  hidden: { opacity: 0, y: 24, filter: `blur(${motionBlur.in})` },
  visible: {
    opacity: 1,
    y: 0,
    filter: `blur(${motionBlur.out})`,
    transition: {
      duration: motionDurations.md,
      ease: motionEasings.out,
    },
  },
};

export const fadeInUpSection: Variants = {
  hidden: { opacity: 0, y: 48 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: motionDurations.lg,
      ease: motionEasings.expoOut,
    },
  },
};

export const blurRevealText: Variants = {
  hidden: { opacity: 0, y: 12, filter: `blur(${motionBlur.in})` },
  visible: {
    opacity: 1,
    y: 0,
    filter: `blur(${motionBlur.out})`,
    transition: {
      duration: motionDurations.md,
      ease: motionEasings.out,
    },
  },
};

export const parallaxFloat: Variants = {
  initial: { opacity: motionOpacity.muted, y: 56, scale: 0.98 },
  inView: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: motionDurations.lg,
      ease: motionEasings.out,
    },
  },
};

/** 3D tilt card — perspective + rotateX/Y on hover */
export const tiltCard: Variants = {
  initial: { rotateX: 0, rotateY: 0, scale: 1 },
  inView: {
    rotateX: 0,
    rotateY: 0,
    scale: 1,
    transition: { duration: motionDurations.md, ease: motionEasings.out },
  },
};

/** Stagger children with delay */
export const staggerContainer = (stagger: number = motionStagger.section): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: stagger,
      delayChildren: 0.1,
    },
  },
});

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: motionDurations.md, ease: motionEasings.out },
  },
};

/** Scale-in with slight overshoot (elastic) */
export const scaleReveal: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: motionDurations.lg,
      ease: motionEasings.elastic,
    },
  },
};

/** Section transition — fade + vertical movement */
export const sectionReveal: Variants = {
  hidden: { opacity: 0, y: 80 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: motionDurations.xl,
      ease: motionEasings.expoOut,
    },
  },
};
