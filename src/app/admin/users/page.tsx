import { requirePageAdmin } from "@/server/auth/page-guards";
import { listUsers } from "@/server/domains/admin/users";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/states";
import { PaginationControls } from "@/components/dashboard/pagination-controls";
import { AdminActionButton } from "@/components/dashboard/admin-action-button";
import { parsePageParam, totalPageCount } from "@/lib/pagination";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Utilisateurs — Admin MakomSpace" };
export const dynamic = "force-dynamic";

function statusLabel(user: { deletedAt: Date | null; suspendedAt: Date | null }): string {
  if (user.deletedAt) return "Supprimé";
  if (user.suspendedAt) return "Suspendu";
  return "Actif";
}

/**
 * Accounts, searchable by e-mail or name. Suspension cuts every session of
 * the account at its next request (see rbac.ts); an administrator cannot
 * suspend their own account — the button is not offered, and the API
 * refuses it anyway.
 */
export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const ctx = await requirePageAdmin();
  const { page: pageParam, q } = await searchParams;
  const page = parsePageParam(pageParam);
  const query = typeof q === "string" ? q.trim().slice(0, 200) : "";

  const { users, totalCount } = await listUsers({ query, page });
  const activeParams = { q: query || undefined };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Utilisateurs</h1>

      <form className="flex max-w-md gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="E-mail ou nom…"
          aria-label="Rechercher un utilisateur"
        />
        <Button type="submit" size="md">
          Rechercher
        </Button>
      </form>

      {users.length === 0 ? (
        <EmptyState
          title="Aucun utilisateur trouvé"
          description={query ? "Aucun compte ne correspond à cette recherche." : "Aucun compte pour l'instant."}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom / e-mail</TableHead>
                <TableHead>Profil</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Inscrit le</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.platformRole === "ADMIN" ? "Administrateur" : user.isLandlord ? "Bailleur" : "Locataire"}
                  </TableCell>
                  <TableCell className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {statusLabel(user)}
                    {user.suspendedAt && !user.deletedAt ? (
                      <span className="block normal-case tracking-normal">
                        depuis le {formatDateTime(user.suspendedAt)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(user.createdAt)}</TableCell>
                  <TableCell>
                    {user.deletedAt || user.id === ctx.userId ? null : user.suspendedAt ? (
                      <AdminActionButton
                        url={`/api/admin/users/${user.id}/reactivate`}
                        label="Réactiver"
                        confirmLabel="Confirmer la réactivation"
                      />
                    ) : (
                      <AdminActionButton
                        url={`/api/admin/users/${user.id}/suspend`}
                        label="Suspendre"
                        confirmLabel="Confirmer la suspension"
                        reason="required"
                        reasonLabel="Motif de la suspension"
                        reasonHint="Ce motif est conservé dans le journal d'audit ; il n'est pas envoyé à l'utilisateur."
                        warning="Le compte est déconnecté partout dès sa prochaine action. Ses données et réservations sont conservées."
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <PaginationControls
            page={page}
            totalPages={totalPageCount(totalCount)}
            basePath="/admin/users"
            searchParams={activeParams}
          />
        </>
      )}
    </div>
  );
}
