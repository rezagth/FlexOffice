import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** "4,7" — French decimal, one digit. */
export function formatRating(value: number): string {
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Five stars filled to the rating (rounded to the half). Decorative for
 * assistive technologies: the accessible text is the label next to it.
 */
export function StarRating({
  value,
  className,
  size = "sm",
}: {
  value: number;
  className?: string;
  size?: "sm" | "md";
}) {
  const rounded = Math.round(value * 2) / 2;
  const iconSize = size === "md" ? "size-5" : "size-4";
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = rounded >= n ? "full" : rounded >= n - 0.5 ? "half" : "empty";
        return (
          <span key={n} className={cn("relative inline-block", iconSize)}>
            <Star className={cn("absolute inset-0 text-border", iconSize)} fill="currentColor" strokeWidth={0} />
            {fill !== "empty" && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: fill === "half" ? "50%" : "100%" }}
              >
                <Star className={cn("text-accent", iconSize)} fill="currentColor" strokeWidth={0} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Stars + "4,7 (12 avis)", with one readable sentence for screen readers. */
export function RatingSummary({
  average,
  count,
  className,
  size = "sm",
}: {
  average: number;
  count: number;
  className?: string;
  size?: "sm" | "md";
}) {
  const label = `Note moyenne ${formatRating(average)} sur 5, ${count} avis`;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <StarRating value={average} size={size} />
      <span aria-hidden="true" className="font-medium text-foreground">
        {formatRating(average)}
      </span>
      <span aria-hidden="true" className="text-muted-foreground">
        ({count} avis)
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
