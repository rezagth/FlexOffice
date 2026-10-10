import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";

/**
 * Prev/next pagination for an admin list — plain links (no client JS
 * needed), preserving every other query param (sort, order, q…) already
 * on the page. Renders nothing when there's only one page. Same
 * page/totalPages/basePath/searchParams API as before; internals now
 * compose the shadcn-style Pagination primitives.
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
    <Pagination className="justify-between pt-2">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href={hrefForPage(Math.max(1, page - 1))} disabled={!hasPrev} />
        </PaginationItem>
      </PaginationContent>
      <p className="text-xs text-muted-foreground">
        Page {page} sur {totalPages}
      </p>
      <PaginationContent>
        <PaginationItem>
          <PaginationNext href={hrefForPage(Math.min(totalPages, page + 1))} disabled={!hasNext} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
