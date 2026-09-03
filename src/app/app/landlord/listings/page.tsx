import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { ButtonLink } from "@/components/ui/button";
import { SPACE_TYPE_LABELS } from "@/lib/format";

export const metadata = { title: "Publications — OfficeFlex" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  PENDING_REVIEW: "En attente de validation",
  PUBLISHED: "Publié",
  REJECTED: "Refusé",
  ARCHIVED: "Archivé",
};

/**
 * Publication status of the organization's spaces.
 *
 * Shows where each space stands in the draft -> review -> published cycle,
 * which is information the partner already needs and which the database
 * already holds. A real `Listing` model — one space, several published
 * offers — is a later phase; until then a space carries its own status and
 * this page reads it rather than inventing a parallel notion.
 *
 * Scoped by activeOrgId, resolved from an ACTIVE membership on this request.
 */
export default async function LandlordListingsPage() {
  const ctx = await requirePageLandlordOrg("landlord:publish_listing");

  const spaces = await prisma.space.findMany({
    where: { organizationId: ctx.activeOrgId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, type: true, city: true, status: true, slug: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Publications</h1>

      {spaces.length === 0 ? (
        <EmptyState
          title="Aucun espace à publier"
          description="Créez un espace, puis soumettez-le à validation pour le rendre visible publiquement."
          action={
            <ButtonLink href="/app/landlord/spaces/new" size="sm">
              Créer un espace
            </ButtonLink>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {spaces.map((space) => (
            <Card key={space.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{space.name}</p>
                <p className="text-sm text-muted-foreground">
                  {SPACE_TYPE_LABELS[space.type] ?? space.type} · {space.city}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {STATUS_LABELS[space.status] ?? space.status}
                </span>
                <ButtonLink
                  href={`/app/landlord/spaces/${space.id}/edit`}
                  variant="ghost"
                  size="sm"
                >
                  Gérer
                </ButtonLink>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
