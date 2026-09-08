import Link from "next/link";
import { clsx } from "clsx";

/**
 * Prev/next pagination for an admin list — plain links (no client JS
 * needed), preserving every other query param (sort, order, q…) already
 * on the page. Renders nothing when there's only one page.
 */
export function PaginationControls({
  page,
  totalPages,
  basePath,
  searchParams,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  /** Every filter/sort param currently active, so changing page doesn't
   * reset them. `page` itself is overwritten below — no need to omit it. */
  searchParams: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  function hrefForPage(target: number): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value) params.set(key, value);
    }
    params.set("page", String(target));
    return `${basePath}?${params.toString()}`;
  }

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between pt-2 text-sm">
      <Link
        href={hrefForPage(Math.max(1, page - 1))}
        aria-disabled={!hasPrev}
        tabIndex={hasPrev ? undefined : -1}
        className={clsx(
          hasPrev ? "text-foreground hover:underline" : "pointer-events-none text-muted-foreground/40"
        )}
      >
        ← Précédent
      </Link>
      <p className="text-xs text-muted-foreground">
        Page {page} sur {totalPages}
      </p>
      <Link
        href={hrefForPage(Math.min(totalPages, page + 1))}
        aria-disabled={!hasNext}
        tabIndex={hasNext ? undefined : -1}
        className={clsx(
          hasNext ? "text-foreground hover:underline" : "pointer-events-none text-muted-foreground/40"
        )}
      >
        Suivant →
      </Link>
    </nav>
  );
}
