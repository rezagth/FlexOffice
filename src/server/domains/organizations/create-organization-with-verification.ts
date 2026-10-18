import type { HolderType, LandlordActivityType, OrganizationStatus } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { ConflictError, ValidationError } from "@/server/lib/errors";
import { createDraftVerification } from "@/server/domains/verification/create";

/**
 * PRD V1.1, R71-R74 — the one circuit both roles go through: "devenir
 * bailleur" and a tenant signing up as a company both end here, so a
 * verified company counts for both (a single Organization, a single
 * LandlordVerification dossier — `activityType: null` is what marks a
 * tenant-only dossier, see requirements.ts). Extracted from
 * organizations/become-landlord.ts, which is now the thin landlord-facing
 * wrapper around this.
 */
export type OrganizationIdentityInput =
  | {
      holderType: "INDIVIDUAL";
      displayName?: string;
      contactEmail?: string;
      address: string;
      city: string;
      postalCode: string;
    }
  | {
      holderType: "COMPANY";
      legalName: string;
      displayName?: string;
      siret: string;
      siren?: string;
      vatNumber?: string;
      legalRepresentativeName: string;
      contactEmail?: string;
      address: string;
      city: string;
      postalCode: string;
    };

export const SIRET_UNIQUE_CONSTRAINT = "organizations_siret_key";

export function isDuplicateSiret(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    typeof error.message === "string" &&
    error.message.includes(SIRET_UNIQUE_CONSTRAINT)
  );
}

/**
 * Creates the Organization, adds the caller as its OWNER member, and opens
 * the DRAFT verification dossier — all in one transaction (same reasoning
 * as the original become-landlord.ts: an organization without a membership
 * grants nothing, one without a dossier never appears in the review queue).
 *
 * `activityType: null` opens a tenant-only dossier (R71-R74): a company that
 * only rents, never lets a property. `grantLandlordCapability` is what
 * actually unlocks publishing (`Profile.isLandlord`) — a tenant-only company
 * never sets it, so this never needs to touch `activeMode` or go anywhere
 * near rbac.ts/active-context.ts.
 */
export async function createOrganizationWithVerification(params: {
  actorUserId: string;
  actorEmail: string;
  actorName: string;
  identity: OrganizationIdentityInput;
  activityType: LandlordActivityType | null;
  isRealEstateProfessional?: boolean;
  grantLandlordCapability: boolean;
}): Promise<{
  id: string;
  name: string;
  holderType: HolderType;
  status: OrganizationStatus;
  verificationId: string;
}> {
  const { identity } = params;

  const existing = await prisma.organizationMember.findFirst({
    where: { profileId: params.actorUserId, status: "ACTIVE" },
    select: { organizationId: true },
  });
  if (existing) {
    throw new ConflictError("Ce compte est déjà associé à une entreprise.");
  }

  // Consistency, not trust: SIREN is the first 9 digits of the SIRET, so a
  // mismatch means the caller sent two contradictory identifiers.
  if (identity.holderType === "COMPANY" && identity.siren) {
    if (identity.siret.slice(0, 9) !== identity.siren) {
      throw new ValidationError("Le SIREN ne correspond pas aux 9 premiers chiffres du SIRET.");
    }
  }

  const contactEmail = identity.contactEmail ?? params.actorEmail;

  const data =
    identity.holderType === "COMPANY"
      ? {
          holderType: "COMPANY" as const,
          name: identity.displayName ?? identity.legalName,
          legalName: identity.legalName,
          siret: identity.siret,
          siren: identity.siren ?? identity.siret.slice(0, 9),
          vatNumber: identity.vatNumber ?? null,
          legalRepresentativeName: identity.legalRepresentativeName,
        }
      : {
          holderType: "INDIVIDUAL" as const,
          // An individual's identity already lives on the Profile; the
          // organization only needs a name to show a client.
          name: identity.displayName ?? params.actorName,
          legalName: null,
          // Enforced by organizations_holder_type_siret_check: an individual
          // holder must have no SIRET.
          siret: null,
          siren: null,
          vatNumber: null,
          legalRepresentativeName: null,
        };

  try {
    return await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          ...data,
          email: contactEmail,
          address: identity.address,
          city: identity.city,
          postalCode: identity.postalCode,
          status: "PENDING_VERIFICATION",
          memberships: {
            create: { profileId: params.actorUserId, orgRole: "OWNER", status: "ACTIVE" },
          },
        },
        select: { id: true, name: true, holderType: true, status: true },
      });

      if (params.grantLandlordCapability) {
        await tx.profile.update({
          where: { id: params.actorUserId },
          data: { isLandlord: true, activeOrganizationId: organization.id },
        });
      }

      const verification = await createDraftVerification(tx, {
        organizationId: organization.id,
        requestedByProfileId: params.actorUserId,
        activityType: params.activityType,
        isRealEstateProfessional:
          identity.holderType === "COMPANY" ? (params.isRealEstateProfessional ?? false) : false,
      });

      return { ...organization, verificationId: verification.id };
    });
  } catch (error) {
    if (isDuplicateSiret(error)) {
      throw new ConflictError(
        "Une entreprise avec ce SIRET est déjà inscrite. Contactez le support si vous pensez qu'il s'agit de la vôtre."
      );
    }
    throw error;
  }
}
