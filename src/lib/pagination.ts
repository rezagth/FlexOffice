/**
 * Shared offset pagination for the admin lists (organizations, payments,
 * listings) — deliberately not a generic query-builder: each page still
 * writes its own Prisma `where`/`orderBy`, this only parses the page
 * number and turns it into `skip`/`take`.
 *
 * Known tradeoff: offset pagination can show a row twice, or skip one,
 * if a row is inserted or removed between two page loads (the classic
 * "page 2 shifts" problem) — acceptable here because these are admin
 * lists browsed by a human within a session, not a stable feed under
 * heavy concurrent writes. A cursor keyed on `id` would avoid it at the
 * cost of no longer supporting "jump to page N" navigation, which the
 * brief specifically asks for. Revisit if these lists ever need to be
 * consistent under high write concurrency.
 */
export const ADMIN_PAGE_SIZE = 20;

/** Parses a `?page=` query param into a 1-based page number — never less
 * than 1, never NaN, never a decimal. */
export function parsePageParam(page: string | string[] | undefined): number {
  const raw = Array.isArray(page) ? page[0] : page;
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function paginationOffsets(page: number, pageSize: number = ADMIN_PAGE_SIZE): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function totalPageCount(totalCount: number, pageSize: number = ADMIN_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
