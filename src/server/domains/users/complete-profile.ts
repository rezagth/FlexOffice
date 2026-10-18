import type { CompleteProfileInput } from "@/lib/validation/signup-wizard";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { logError } from "@/server/lib/logger";
import { ConflictError } from "@/server/lib/errors";
import { needsOrganization } from "./register-wizard";
import { createOrganizationWithVerification } from "@/server/domains/organizations/create-organization-with-verification";

/**
 * PRD V1.1, R15/R62 — `/app/complete-profile`'s submission, for an existing
 * account whose `accountNeed`/`holderType`/phone were never recorded (it
 * predates migration 20261018143000, or signed up through the pre-wizard
 * `/api/auth/register`). Mirrors `registerFromWizard()`'s post-signup half
 * exactly (same `needsOrganization()` call, same
 * `createOrganizationWithVerification()` shape) — this account already
 * exists, so only that half applies; there is no Supabase signUp() step.
 *
 * Only creates an organization when the account doesn't already have an
 * ACTIVE membership in one — an account that already has a company or a
 * letting activity keeps it; this never creates a second one.
 */
export type CompleteProfileOutcome =
  | { organizationCreated: true }
  | { organizationCreated: false; organizationFailedReason?: string };

export async function completeExistingProfile(
  userId: string,
  input: CompleteProfileInput
): Promise<CompleteProfileOutcome> {
  const profile = await prisma.profile.findUniqueOrThrow({ where: { id: userId } });

  await prisma.profile.update({
    where: { id: userId },
    data: { accountNeed: input.need, holderType: input.holderType, phone: input.phone },
  });
  await recordAudit({
    event: "user.profile_completed",
    actorUserId: userId,
    organizationId: null,
    metadata: { need: input.need, holderType: input.holderType },
  });

  if (!needsOrganization(input)) {
    return { organizationCreated: false };
  }

  const existingMembership = await prisma.organizationMember.findFirst({
    where: { profileId: userId, status: "ACTIVE" },
  });
  if (existingMembership) {
    return { organizationCreated: false };
  }

  const identity =
    input.holderType === "COMPANY"
      ? {
          holderType: "COMPANY" as const,
          legalName: input.legalName!,
          siret: input.siret!,
          siren: input.siren,
          vatNumber: input.vatNumber,
          legalRepresentativeName: input.legalRepresentativeName!,
          address: input.address!,
          city: input.city!,
          postalCode: input.postalCode!,
          contactEmail: profile.email,
        }
      : {
          holderType: "INDIVIDUAL" as const,
          displayName: profile.name,
          contactEmail: profile.email,
          address: input.address!,
          city: input.city!,
          postalCode: input.postalCode!,
        };

  try {
    const organization = await createOrganizationWithVerification({
      actorUserId: userId,
      actorEmail: profile.email,
      actorName: profile.name,
      identity,
      activityType: input.need === "PUBLISH" ? (input.activityType ?? null) : null,
      isRealEstateProfessional: input.isRealEstateProfessional,
      grantLandlordCapability: input.need === "PUBLISH",
    });
    await recordAudit({
      event: "organization.created",
      actorUserId: userId,
      organizationId: organization.id,
      metadata: { name: organization.name, source: "complete_profile" },
    });
    return { organizationCreated: true };
  } catch (error) {
    if (error instanceof ConflictError) {
      return { organizationCreated: false, organizationFailedReason: error.message };
    }
    logError({ event: "user.complete_profile_organization_failed", error, user_id: userId });
    return {
      organizationCreated: false,
      organizationFailedReason:
        "Votre profil a été enregistré, mais vos informations d'entreprise n'ont pas pu être enregistrées.",
    };
  }
}
