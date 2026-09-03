import { requirePageAuth } from "@/server/auth/page-guards";
import { TenantHome } from "@/components/dashboard/tenant-home";
import { LandlordHome } from "@/components/dashboard/landlord-home";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

// Reflects the account's live state and its bookings — must not be cached.
export const dynamic = "force-dynamic";

/**
 * The single home for both modes.
 *
 * One URL rather than `/client/dashboard` and `/partner/dashboard`: the mode
 * changes what this page shows, not where it lives. That is the difference
 * between a mode and an account type, and keeping two URLs is what kept the
 * old model alive in the router.
 *
 * `activeMode` decides which home renders — a presentation decision, which is
 * the only kind of decision the mode is allowed to make. Whether the landlord
 * home may show revenue is a capability question, answered inside it.
 */
export default async function AppHomePage() {
  const ctx = await requirePageAuth();

  if (ctx.activeMode === "LANDLORD" && ctx.activeOrgId) {
    return <LandlordHome ctx={{ ...ctx, activeOrgId: ctx.activeOrgId }} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* The stored mode was LANDLORD but no ACTIVE membership backed it —
          revoked, downgraded, or the organization is gone. Saying so beats
          silently rendering the tenant home and leaving the user wondering
          where their spaces went. */}
      {ctx.landlordContextUnavailable && (
        <Card className="flex flex-col gap-3 border-accent/40 p-5">
          <div>
            <h2 className="text-base font-medium text-foreground">
              Mode bailleur indisponible
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Votre accès à l&apos;organisation concernée n&apos;est plus actif.
              Vous continuez à utiliser OfficeFlex en tant que locataire.
            </p>
          </div>
          {!ctx.isLandlord && (
            <ButtonLink href="/app/become-landlord" size="sm" className="self-start">
              Devenir bailleur
            </ButtonLink>
          )}
        </Card>
      )}

      <TenantHome ctx={ctx} />
    </div>
  );
}
