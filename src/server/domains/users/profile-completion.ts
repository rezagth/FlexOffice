import { prisma } from "@/server/db/prisma";
import type { AccountNeed, HolderType } from "@/generated/prisma/client";

/**
 * PRD V1.1, R15/R62 — the single definition of "this account's profile is
 * complete", shared by the onboarding checklist (read-only, shows a step)
 * and profile-completion-guard.ts (hard boundary, throws). NULL on either
 * field only ever means "not yet answered" — never a default to fall back
 * on — so an account that predates the `account_need`/`holder_type` columns
 * (migration 20261018143000) is incomplete exactly like one that skipped the
 * question a moment ago.
 */
export function isProfileComplete(profile: {
  phone: string | null;
  accountNeed: AccountNeed | null;
  holderType: HolderType | null;
}): boolean {
  return Boolean(profile.phone?.trim()) && profile.accountNeed !== null && profile.holderType !== null;
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
