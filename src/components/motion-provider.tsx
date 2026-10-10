"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * Wraps the app once at the root so every motion animation — the space
 * card hover lift, the search results stagger, the space detail fade-in —
 * automatically respects the visitor's OS/browser "reduce motion"
 * preference, instead of each animated component having to opt into that
 * check individually and risk forgetting it.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
