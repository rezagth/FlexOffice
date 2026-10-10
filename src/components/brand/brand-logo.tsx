import { SITE_NAME } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * MakomSpace mark: a navy "M" whose middle stroke opens on a gold door —
 * the space, and the way in. Drawn inline so it inherits no network request
 * and stays crisp at any size. Colours follow the theme tokens: the stems
 * use `currentColor` (navy on light surfaces, white inside `.surface-dark`),
 * the door is always the gold accent.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path
        d="M9 40V11l15 15 15-15v29"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M17.5 40v-5a6.5 6.5 0 0 1 13 0V40z" fill="var(--accent)" />
      <circle cx="27.4" cy="35.6" r="1.3" fill="currentColor" />
    </svg>
  );
}

/**
 * Mark + wordmark ("MAKOM" in the current colour, "SPACE" in gold — the darker text gold
 * on light surfaces, for contrast). The
 * accessible name is the brand name written normally, once.
 */
export function BrandLogo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark className={markClassName} />
      <span aria-hidden="true" className="font-heading text-lg font-bold tracking-[0.08em]">
        MAKOM<span className="text-accent-text">SPACE</span>
      </span>
      <span className="sr-only">{SITE_NAME}</span>
    </span>
  );
}
