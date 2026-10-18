import { redirect } from "next/navigation";
import { requirePageAuth } from "@/server/auth/page-guards";
import { Card } from "@/components/ui/card";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";
import { safeRedirectPath } from "@/lib/validation/redirect";
import { isCompanyInfoComplete, isProfileComplete } from "@/server/domains/users/profile-completion";
import { getOwnProfile } from "@/server/domains/users/profile";
import { prisma } from "@/server/db/prisma";

export const metadata = { title: "Complétez votre profil — MakomSpace" };
export const dynamic = "force-dynamic";

/**
 * PRD V1.1, R62 — the dedicated screen a booking or a publish attempt
 * redirects to when the account is missing required information, instead of
 * "Mon compte": account access stays available everywhere else, only
 * booking/publishing are blocked (profile-completion-guard.ts enforces that
 * server-side; this page is the way out of it, not a second gate).
 */
export default async function CompleteProfilePage({
  searchParams,
}: PageProps<"/app/complete-profile">) {
  const ctx = await requirePageAuth({ redirectTo: "/app/complete-profile" });
  const [profile, { redirectTo }, existingMembership] = await Promise.all([
    getOwnProfile(ctx.userId),
    searchParams,
    prisma.organizationMember.findFirst({
      where: { profileId: ctx.userId, status: "ACTIVE" },
      select: { organizationId: true },
    }),
  ]);
  const backHref = typeof redirectTo === "string" ? safeRedirectPath(redirectTo, "") : "";

  if (profile && isProfileComplete(profile) && (await isCompanyInfoComplete(ctx.userId))) {
    redirect(backHref || "/app/account");
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Complétez votre profil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ces informations sont nécessaires avant de réserver ou de publier un espace. Votre
          compte reste accessible normalement en attendant.
        </p>
      </div>
      <Card className="p-5">
        <CompleteProfileForm
          initialNeed={profile?.accountNeed ?? ""}
          initialHolderType={profile?.holderType ?? ""}
          initialPhone={profile?.phone ?? ""}
          hasOrganization={Boolean(existingMembership)}
          backHref={backHref}
        />
      </Card>
    </div>
  );
}
