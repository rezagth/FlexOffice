import { getAuthContext } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { SPACE_TYPE_LABELS } from "@/lib/format";

export default async function AdminListingsPage() {
  if (!(await getAuthContext())) return null; // layout already enforces the role; this guards the brief render race before that redirect completes
  const spaces = await prisma.space.findMany({
    include: { organization: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Annonces</h1>
      <p className="max-w-lg text-sm text-muted-foreground">
        Valider, modifier ou supprimer une annonce arrive dans une prochaine
        itération.
      </p>

      {spaces.length === 0 ? (
        <EmptyState
          title="Aucune annonce pour l'instant"
          description="Les espaces publiés par les entreprises partenaires apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {spaces.map((space) => (
            <Card key={space.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{space.name}</p>
                <p className="text-sm text-muted-foreground">
                  {space.organization.name} ·{" "}
                  {SPACE_TYPE_LABELS[space.type] ?? space.type}
                </p>
              </div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {space.status}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
