import Link from "next/link";
import { requirePageAdmin } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/states";
import { PaginationControls } from "@/components/dashboard/pagination-controls";
import { SortLink } from "@/components/dashboard/sort-link";
import { parsePageParam, paginationOffsets, totalPageCount } from "@/lib/pagination";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const SORT_FIELDS = ["createdAt", "name", "status"] as const;
type SortField = (typeof SORT_FIELDS)[number];

function parseSort(value: string | string[] | undefined): SortField {
  const raw = Array.isArray(value) ? value[0] : value;
  return (SORT_FIELDS as readonly string[]).includes(raw ?? "") ? (raw as SortField) : "createdAt";
}

function parseOrder(value: string | string[] | undefined): "asc" | "desc" {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "asc" ? "asc" : "desc";
}

export default async function AdminOrganizationsPage({
  searchParams,
}: PageProps<"/admin/organizations">) {
  await requirePageAdmin();
  const { page: pageParam, sort: sortParam, order: orderParam, q } = await searchParams;

  const page = parsePageParam(pageParam);
  const sort = parseSort(sortParam);
  const order = parseOrder(orderParam);
  const query = typeof q === "string" ? q.trim() : "";

  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { siret: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [organizations, totalCount] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: { [sort]: order },
      ...paginationOffsets(page),
    }),
    prisma.organization.count({ where }),
  ]);

  const activeParams = { q: query || undefined, sort, order };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Entreprises</h1>
      <p className="max-w-lg text-sm text-muted-foreground">
        Le contrôle des pièces justificatives (CNI, Kbis, TVA, carte
        professionnelle selon le profil) se fait dossier par dossier dans{" "}
        <Link href="/admin/verifications" className="underline hover:no-underline">
          Vérifications
        </Link>
        . Voici les entreprises inscrites à date, avec leur statut.
      </p>

      <form className="flex max-w-md gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Nom ou SIRET…"
          aria-label="Filtrer les entreprises"
        />
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="order" value={order} />
        <Button type="submit" size="md">
          Filtrer
        </Button>
      </form>

      {organizations.length === 0 ? (
        <EmptyState
          title="Aucune entreprise trouvée"
          description={
            query
              ? "Aucune entreprise ne correspond à cette recherche."
              : "Les entreprises qui s'inscrivent en tant que partenaire apparaîtront ici."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortLink
                    label="Nom"
                    field="name"
                    currentSort={sort}
                    currentOrder={order}
                    defaultOrder="asc"
                    basePath="/admin/organizations"
                    searchParams={activeParams}
                  />
                </TableHead>
                <TableHead>SIRET / Ville</TableHead>
                <TableHead>
                  <SortLink
                    label="Statut"
                    field="status"
                    currentSort={sort}
                    currentOrder={order}
                    defaultOrder="asc"
                    basePath="/admin/organizations"
                    searchParams={activeParams}
                  />
                </TableHead>
                <TableHead>
                  <SortLink
                    label="Inscrite le"
                    field="createdAt"
                    currentSort={sort}
                    currentOrder={order}
                    basePath="/admin/organizations"
                    searchParams={activeParams}
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    SIRET {org.siret} · {org.city}
                  </TableCell>
                  <TableCell className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {org.status}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(org.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <PaginationControls
            page={page}
            totalPages={totalPageCount(totalCount)}
            basePath="/admin/organizations"
            searchParams={activeParams}
          />
        </>
      )}
    </div>
  );
}
