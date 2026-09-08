"use client";

import { motion } from "motion/react";
import { SpaceCard, type SpaceCardData } from "@/components/marketing/space-card";

/**
 * The results grid on /search, the landing page's "espaces à la une", and
 * /app/favorites — a short, capped stagger as the cards mount, not a
 * scroll-triggered reveal: every card is already in the initial render,
 * this only eases their entrance over ~350ms total regardless of how many
 * there are (the per-card delay is capped, not linear in the list length).
 */
export function SearchResultsGrid({ spaces }: { spaces: SpaceCardData[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {spaces.map((space, index) => (
        <motion.div
          key={space.slug}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.04, ease: "easeOut" }}
        >
          <SpaceCard space={space} href={`/spaces/${space.slug}`} />
        </motion.div>
      ))}
    </div>
  );
}
