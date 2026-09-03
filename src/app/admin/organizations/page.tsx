import Link from "next/link";
import { requirePageAdmin } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";

export default async function AdminOrganizationsPage() {
  await requirePageAdmin();
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
  });

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
