import { listActiveMemberships } from "@/server/auth/active-context";
import { requirePageAuth } from "@/server/auth/page-guards";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { AccountDataActions } from "@/components/auth/account-data-actions";
import { AccountEmailForm } from "@/components/auth/account-email-form";
import { AccountPasswordForm } from "@/components/auth/account-password-form";
import { AccountProfileForm } from "@/components/auth/account-profile-form";
import { FormMessage } from "@/components/auth/form-field";
import { getOwnProfile } from "@/server/domains/users/profile";

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
export default async function AccountPage({ searchParams }: PageProps<"/app/account">) {
  const ctx = await requirePageAuth({ redirectTo: "/app/account" });
  const [memberships, profile, { email: emailFlag }] = await Promise.all([
    ctx.isLandlord ? listActiveMemberships(ctx.userId) : Promise.resolve([]),
    getOwnProfile(ctx.userId),
    searchParams,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Compte</h1>

      {emailFlag === "confirmed" && (
        <div className="max-w-lg">
          <FormMessage tone="success">
            Lien confirmé. Si un second lien a été envoyé à votre autre adresse, cliquez
            aussi dessus : le changement d&apos;adresse prend effet une fois les deux
            confirmés.
          </FormMessage>
        </div>
      )}

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
        <h2 className="mb-4 text-lg font-medium">Mes informations</h2>
        <AccountProfileForm initialName={profile?.name ?? ctx.name} initialPhone={profile?.phone ?? ""} />
      </Card>

      <Card className="max-w-lg p-5">
        <h2 className="mb-4 text-lg font-medium">Adresse e-mail</h2>
        <AccountEmailForm currentEmail={profile?.email ?? ctx.email} />
      </Card>

      <Card className="max-w-lg p-5">
        <h2 className="mb-4 text-lg font-medium">Mot de passe</h2>
        <AccountPasswordForm />
      </Card>

      <Card className="max-w-lg p-5">
        <h2 className="mb-4 text-lg font-medium">Mes données personnelles</h2>
        <AccountDataActions />
        {profile?.termsAcceptedAt && (
          <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
            Conditions générales et politique de confidentialité acceptées le{" "}
            {profile.termsAcceptedAt.toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" })}{" "}
            (version du {profile.termsVersion}).
          </p>
        )}
      </Card>
    </div>
  );
}
