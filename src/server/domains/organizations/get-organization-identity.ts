import { prisma } from "@/server/db/prisma";
import type { HolderType, OrganizationStatus, OrgRole, VerificationStatus } from "@/generated/prisma/client";

/**
 * "Mon compte" — one row per organization the profile is an ACTIVE member
 * of, with just enough to show its identity and let R81 edits happen
 * (`orgRole` gates whether the edit form renders at all: OWNER/ADMIN only,
 * same pair the PATCH route re-checks server-side before trusting the body).
 */
export type OrganizationIdentitySummary = {
  id: string;
  name: string;
  holderType: HolderType;
  status: OrganizationStatus;
  orgRole: OrgRole;
  siret: string | null;
  legalName: string | null;
  verificationStatus: VerificationStatus | null;
};

export async function listOrganizationIdentitiesForProfile(
  profileId: string
): Promise<OrganizationIdentitySummary[]> {
  const memberships = await prisma.organizationMember.findMany({
    where: { profileId, status: "ACTIVE" },
    select: {
      orgRole: true,
      organization: {
        select: { id: true, name: true, holderType: true, status: true, siret: true, legalName: true },
      },
    },
  });
  if (memberships.length === 0) return [];

  // Latest verification per org, resolved the same way
  // update-organization-identity.ts does (orderBy createdAt desc, first hit
  // wins) rather than a second query per org.
  const verifications = await prisma.landlordVerification.findMany({
    where: { organizationId: { in: memberships.map((m) => m.organization.id) } },
    orderBy: { createdAt: "desc" },
    select: { organizationId: true, status: true },
  });
  const latestStatusByOrgId = new Map<string, VerificationStatus>();
  for (const verification of verifications) {
    if (!latestStatusByOrgId.has(verification.organizationId)) {
      latestStatusByOrgId.set(verification.organizationId, verification.status);
    }
  }

  return memberships.map((membership) => ({
    ...membership.organization,
    orgRole: membership.orgRole,
    verificationStatus: latestStatusByOrgId.get(membership.organization.id) ?? null,
  }));
}
