import { listActiveMemberships } from "@/server/auth/active-context";
import { requirePageAuth } from "@/server/auth/page-guards";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { GdprActions } from "@/components/dashboard/gdpr-actions";

export const metadata = { title: "Compte — OfficeFlex" };
export const dynamic = "force-dynamic";

const ORG_ROLE_LABELS: Record<string, string> = {
  OWNER: "Propriétaire",
  ADMIN: "Administrateur",
  MANAGER: "Gestionnaire",
  ACCOUNTANT: "Comptable",
  VIEWER: "Lecture seule",
};

/**
 * Account page, replacing `/client/profile`.
 *
 * Shows what the account *is* — one identity, the capabilities it has
 * unlocked, and the organizations it belongs to — rather than a single
 * "Rôle : Client" line, which is precisely the framing Phase 2 removed.
 *
 * Reached in either mode: your account is not part of what you are currently
 * doing.
 */
export default async function AccountPage() {
  const ctx = await requirePageAuth({ redirectTo: "/app/account" });
  const memberships = ctx.isLandlord ? await listActiveMemberships(ctx.userId) : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Compte</h1>

      <Card className="max-w-lg p-5">
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Nom</dt>
            <dd className="font-medium">{ctx.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="truncate font-medium">{ctx.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Mode actuel</dt>
            <dd className="font-medium">
              {ctx.activeMode === "LANDLORD" ? "Bailleur" : "Locataire"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Activité de bailleur</dt>
            <dd className="font-medium">{ctx.isLandlord ? "Activée" : "Non activée"}</dd>
          </div>
          {ctx.platformRole === "ADMIN" && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Administration</dt>
              <dd className="font-medium">Accès back-office</dd>
            </div>
          )}
        </dl>
      </Card>

      {!ctx.isLandlord ? (
        <Card className="flex max-w-lg flex-col gap-3 p-5">
          <div>
            <h2 className="text-lg font-medium text-foreground">Devenir bailleur</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Louez votre propre espace depuis ce même compte, sans créer un
              second identifiant.
            </p>
          </div>
          <ButtonLink href="/app/become-landlord" size="sm" className="self-start">
            Ouvrir une activité de bailleur
          </ButtonLink>
        </Card>
      ) : (
        <Card className="max-w-lg p-5">
          <h2 className="mb-3 text-lg font-medium text-foreground">
            Mes organisations
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {memberships.map((membership) => (
              <li
                key={membership.organizationId}
                className="flex items-center justify-between gap-4"
              >
                <span className="truncate font-medium">
                  {membership.organizationName}
                </span>
                <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                  {ORG_ROLE_LABELS[membership.orgRole] ?? membership.orgRole}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            L&apos;invitation de collaborateurs arrive avec la gestion
            professionnelle, dans une prochaine itération.
          </p>
        </Card>
      )}

      <Card className="max-w-lg p-5">
        <h2 className="mb-4 text-lg font-medium">Mes données personnelles</h2>
        <GdprActions />
      </Card>

      <p className="max-w-lg text-sm text-muted-foreground">
        La modification des informations de profil arrive dans une prochaine
        itération.
      </p>
    </div>
  );
}
