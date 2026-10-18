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
export function isProfileComplete(profile: {
  phone: string | null;
  phoneVerifiedAt: Date | null;
  accountNeed: AccountNeed | null;
  holderType: HolderType | null;
}): boolean {
  const phoneOk = isPhoneVerificationRequired()
    ? profile.phoneVerifiedAt !== null
    : Boolean(profile.phone?.trim());
  return phoneOk && profile.accountNeed !== null && profile.holderType !== null;
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
