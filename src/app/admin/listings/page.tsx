import { getAuthContext } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { SpaceModerationActions } from "@/components/dashboard/space-moderation-actions";
import { SPACE_STATUS_LABELS, SPACE_TYPE_LABELS } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminListingsPage() {
  if (!(await getAuthContext())) return null; // layout already enforces the role; this guards the brief render race before that redirect completes
  const spaces = await prisma.space.findMany({
    include: { organization: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const pending = spaces.filter((space) => space.status === "PENDING_REVIEW");
  const others = spaces.filter((space) => space.status !== "PENDING_REVIEW");

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
        {others.length === 0 ? (
          <EmptyState
            title="Aucune autre annonce"
            description="Les espaces publiés par les entreprises partenaires apparaîtront ici."
          />
        ) : (
          others.map((space) => (
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
          ))
        )}
      </section>
    </div>
  );
}
