import { requirePageAdmin } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/states";
import { PaginationControls } from "@/components/dashboard/pagination-controls";
import { SortLink } from "@/components/dashboard/sort-link";
import { parsePageParam, paginationOffsets, totalPageCount } from "@/lib/pagination";
import { formatCents, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const SORT_FIELDS = ["createdAt", "amountCents", "status"] as const;
type SortField = (typeof SORT_FIELDS)[number];

function parseSort(value: string | string[] | undefined): SortField {
  const raw = Array.isArray(value) ? value[0] : value;
  return (SORT_FIELDS as readonly string[]).includes(raw ?? "") ? (raw as SortField) : "createdAt";
}

function parseOrder(value: string | string[] | undefined): "asc" | "desc" {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "asc" ? "asc" : "desc";
}

export default async function AdminPaymentsPage({
  searchParams,
}: PageProps<"/admin/payments">) {
  await requirePageAdmin();
  const { page: pageParam, sort: sortParam, order: orderParam, q } = await searchParams;

  const page = parsePageParam(pageParam);
  const sort = parseSort(sortParam);
  const order = parseOrder(orderParam);
  const query = typeof q === "string" ? q.trim() : "";

  const where = query
    ? { organization: { name: { contains: query, mode: "insensitive" as const } } }
    : {};

  const [payments, totalCount] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { organization: { select: { name: true } } },
      orderBy: { [sort]: order },
      ...paginationOffsets(page),
    }),
    prisma.payment.count({ where }),
  ]);

  const activeParams = { q: query || undefined, sort, order };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Paiements</h1>
      <p className="max-w-lg text-sm text-muted-foreground">
        Le suivi des remboursements et des reversements détaillés arrive dans une
        prochaine itération (intégration Stripe Connect réelle).
      </p>

      <form className="flex max-w-md gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Nom de l'entreprise…"
          aria-label="Filtrer les paiements par entreprise"
        />
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="order" value={order} />
        <Button type="submit" size="md">
          Filtrer
        </Button>
      </form>

      {payments.length === 0 ? (
        <EmptyState
          title="Aucun paiement trouvé"
          description={
            query
              ? "Aucun paiement ne correspond à cette recherche."
              : "Les paiements des réservations apparaîtront ici."
          }
        />
      ) : (
        <>
          <div className="flex gap-4 px-1 text-xs">
            <SortLink
              label="Date"
              field="createdAt"
              currentSort={sort}
              currentOrder={order}
              basePath="/admin/payments"
              searchParams={activeParams}
            />
            <SortLink
              label="Montant"
              field="amountCents"
              currentSort={sort}
              currentOrder={order}
              basePath="/admin/payments"
              searchParams={activeParams}
            />
            <SortLink
              label="Statut"
              field="status"
              currentSort={sort}
              currentOrder={order}
              defaultOrder="asc"
              basePath="/admin/payments"
              searchParams={activeParams}
            />
          </div>

          <div className="flex flex-col gap-3">
            {payments.map((payment) => (
              <Card key={payment.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{payment.organization.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(payment.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{formatCents(payment.amountCents)}</p>
                  <p className="text-xs text-muted-foreground">{payment.status}</p>
                </div>
              </Card>
            ))}
          </div>

          <PaginationControls
            page={page}
            totalPages={totalPageCount(totalCount)}
            basePath="/admin/payments"
            searchParams={activeParams}
          />
        </>
      )}
    </div>
  );
}
