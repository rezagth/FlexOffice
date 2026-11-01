import { prisma } from "@/server/db/prisma";
import type { AccountNeed, HolderType } from "@/generated/prisma/client";
import { isPhoneVerificationRequired } from "@/server/auth/runtime-config";

/**
 * PRD V1.1, R15/R62/2B — the single definition of "this account's profile is
 * complete", shared by the onboarding checklist (read-only, shows a step)
 * and profile-completion-guard.ts (hard boundary, throws). NULL on
 * `accountNeed`/`holderType` only ever means "not yet answered" — never a
 * default to fall back on — so an account that predates those columns
 * (migration 20261018143000) is incomplete exactly like one that skipped the
 * question a moment ago.
 *
 * The phone requirement itself depends on `isPhoneVerificationRequired()`
 * (runtime-config.ts, the `PHONE_VERIFICATION_REQUIRED` env var — explicit,
 * operator-set, never inferred from whether an SMS provider is configured):
 * `true` (default) requires a verified phone, `false` only a filled one —
 * the pre-2B behavior, kept available for a production deployment that has
 * no real SMS provider wired up yet.
 */
type ProfileCompletionInput = {
  phone: string | null;
  phoneVerifiedAt: Date | null;
  accountNeed: AccountNeed | null;
  holderType: HolderType | null;
};

/**
 * What is still missing, in plain French, in the order the user should do it.
 * Single source for both the rule (`isProfileComplete`) and the messages
 * shown on the publish / book screens, so the two can never disagree.
 */
export function missingProfileItems(profile: ProfileCompletionInput): string[] {
  const missing: string[] = [];
  if (isPhoneVerificationRequired()) {
    if (profile.phoneVerifiedAt === null) {
      missing.push(
        profile.phone?.trim()
          ? "vérifier votre numéro de téléphone (code reçu par SMS)"
          : "renseigner et vérifier votre numéro de téléphone (code reçu par SMS)"
      );
    }
  } else if (!profile.phone?.trim()) {
    missing.push("renseigner votre numéro de téléphone");
  }
  if (profile.accountNeed === null) {
    missing.push("indiquer si vous cherchez ou publiez un espace");
  }
  if (profile.holderType === null) {
    missing.push("indiquer si vous agissez en tant que particulier ou société");
  }
  return missing;
}

export function isProfileComplete(profile: ProfileCompletionInput): boolean {
  return missingProfileItems(profile).length === 0;
}

/**
 * PRD V1.1, R22/R24 — a company (never a plain individual tenant, who has no
 * organization to check) must have its legal identity on file before it can
 * book. In practice this is already enforced at the point an organization is
 * created (becomeLandlordSchema/signupWizardSchema both require
 * legalName+siret for holderType COMPANY), so this mostly guards against an
 * organization created through some other path; it reads the organization
 * directly rather than assuming that invariant holds.
 */
export async function isCompanyInfoComplete(profileId: string): Promise<boolean> {
  const membership = await prisma.organizationMember.findFirst({
    where: { profileId, status: "ACTIVE", organization: { holderType: "COMPANY" } },
    select: { organization: { select: { legalName: true, siret: true } } },
  });
  if (!membership) return true;
  return Boolean(membership.organization.legalName?.trim()) && Boolean(membership.organization.siret?.trim());
}
