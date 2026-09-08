import { requirePageAdmin } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/states";
import { SpaceModerationActions } from "@/components/dashboard/space-moderation-actions";
import { PaginationControls } from "@/components/dashboard/pagination-controls";
import { SortLink } from "@/components/dashboard/sort-link";
import { parsePageParam, paginationOffsets, totalPageCount } from "@/lib/pagination";
import { SPACE_STATUS_LABELS, SPACE_TYPE_LABELS } from "@/lib/format";

export const dynamic = "force-dynamic";

const SORT_FIELDS = ["createdAt", "status"] as const;
type SortField = (typeof SORT_FIELDS)[number];

function parseSort(value: string | string[] | undefined): SortField {
  const raw = Array.isArray(value) ? value[0] : value;
  return (SORT_FIELDS as readonly string[]).includes(raw ?? "") ? (raw as SortField) : "createdAt";
}

function parseOrder(value: string | string[] | undefined): "asc" | "desc" {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "asc" ? "asc" : "desc";
}

export default async function AdminListingsPage({
  searchParams,
}: PageProps<"/admin/listings">) {
  await requirePageAdmin();
  const { page: pageParam, sort: sortParam, order: orderParam, q } = await searchParams;

  const page = parsePageParam(pageParam);
  const sort = parseSort(sortParam);
  const order = parseOrder(orderParam);
  const query = typeof q === "string" ? q.trim() : "";

  const textFilter = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { organization: { name: { contains: query, mode: "insensitive" as const } } },
        ],
      }
    : {};

  // "En attente de validation" is the moderation queue admins must clear —
  // always shown in full, not paginated: it's meant to trend toward empty,
  // not to be browsed page by page. Pagination/sort/filter apply only to
  // "Toutes les annonces" below.
  const [pending, others, othersCount] = await Promise.all([
    prisma.space.findMany({
      where: { status: "PENDING_REVIEW" },
      include: { organization: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.space.findMany({
      where: { status: { not: "PENDING_REVIEW" }, ...textFilter },
      include: { organization: { select: { name: true } } },
      orderBy: { [sort]: order },
      ...paginationOffsets(page),
    }),
    prisma.space.count({ where: { status: { not: "PENDING_REVIEW" }, ...textFilter } }),
  ]);

  const activeParams = { q: query || undefined, sort, order };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Annonces</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">
          En attente de validation{pending.length > 0 ? ` (${pending.length})` : ""}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune annonce à valider.</p>
        ) : (
          pending.map((space) => (
            <Card key={space.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{space.name}</p>
                <p className="text-sm text-muted-foreground">
                  {space.organization.name} · {SPACE_TYPE_LABELS[space.type] ?? space.type} ·{" "}
                  {space.city}
                </p>
              </div>
              <SpaceModerationActions spaceId={space.id} />
            </Card>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Toutes les annonces</h2>

        <form className="flex max-w-md gap-2">
          <Input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Nom de l'espace ou de l'entreprise…"
            aria-label="Filtrer les annonces"
          />
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="order" value={order} />
          <Button type="submit" size="md">
            Filtrer
          </Button>
        </form>

        {others.length === 0 ? (
          <EmptyState
            title="Aucune autre annonce"
            description={
              query
                ? "Aucune annonce ne correspond à cette recherche."
                : "Les espaces publiés par les entreprises partenaires apparaîtront ici."
            }
          />
        ) : (
          <>
            <div className="flex gap-4 px-1 text-xs">
              <SortLink
                label="Date de création"
                field="createdAt"
                currentSort={sort}
                currentOrder={order}
                basePath="/admin/listings"
                searchParams={activeParams}
              />
              <SortLink
                label="Statut"
                field="status"
                currentSort={sort}
                currentOrder={order}
                defaultOrder="asc"
                basePath="/admin/listings"
                searchParams={activeParams}
              />
            </div>

            {others.map((space) => (
              <Card key={space.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{space.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {space.organization.name} · {SPACE_TYPE_LABELS[space.type] ?? space.type}
                  </p>
                </div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {SPACE_STATUS_LABELS[space.status] ?? space.status}
                </p>
              </Card>
            ))}

            <PaginationControls
              page={page}
              totalPages={totalPageCount(othersCount)}
              basePath="/admin/listings"
              searchParams={activeParams}
            />
          </>
        )}
      </section>
    </div>
  );
}
