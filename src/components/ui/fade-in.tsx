"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/**
 * A short, immediate fade-up on mount — not a scroll-triggered reveal.
 * Content wrapped here is already rendered and present in the DOM; this
 * only eases its opacity/position in over ~300ms starting the instant it
 * mounts, so nothing a visitor expects to see right away is ever left
 * waiting on a scroll position or an IntersectionObserver.
 */
export function FadeIn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
