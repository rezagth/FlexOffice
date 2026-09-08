import Link from "next/link";
import { clsx } from "clsx";

/**
 * A clickable column-header label that toggles sort on an admin list.
 * Clicking the already-active field flips asc/desc; clicking a different
 * field switches to it at `defaultOrder`. Always drops back to page 1 (it
 * never sets `page`) — showing page 3 of a list re-sorted from under it
 * would be confusing, not helpful.
 */
export function SortLink({
  label,
  field,
  currentSort,
  currentOrder,
  defaultOrder = "desc",
  basePath,
  searchParams,
}: {
  label: string;
  field: string;
  currentSort: string;
  currentOrder: "asc" | "desc";
  defaultOrder?: "asc" | "desc";
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  const isActive = currentSort === field;
  const nextOrder: "asc" | "desc" = isActive ? (currentOrder === "asc" ? "desc" : "asc") : defaultOrder;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== "page" && key !== "sort" && key !== "order") params.set(key, value);
  }
  params.set("sort", field);
  params.set("order", nextOrder);

  return (
    <Link
      href={`${basePath}?${params.toString()}`}
      className={clsx(
        "hover:underline",
        isActive ? "font-medium text-foreground" : "text-muted-foreground"
      )}
    >
      {label}
      {isActive ? (currentOrder === "asc" ? " ↑" : " ↓") : ""}
    </Link>
  );
}
