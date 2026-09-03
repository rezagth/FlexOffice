import { requirePageRole } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";

export default async function AdminOrganizationsPage() {
  await requirePageRole("ADMIN");
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Entreprises</h1>
      <p className="max-w-lg text-sm text-muted-foreground">
        La validation SIRET et le contrôle des pièces justificatives arrivent dans
        une prochaine itération. Voici les entreprises inscrites à date, avec leur
        statut de vérification.
      </p>

      {organizations.length === 0 ? (
        <EmptyState
          title="Aucune entreprise inscrite"
          description="Les entreprises qui s'inscrivent en tant que partenaire apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {organizations.map((org) => (
            <Card key={org.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{org.name}</p>
                <p className="text-sm text-muted-foreground">
                  SIRET {org.siret} · {org.city}
                </p>
              </div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {org.status}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
