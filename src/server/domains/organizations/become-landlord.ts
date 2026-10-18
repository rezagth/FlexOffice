import type { BecomeLandlordInput } from "@/lib/validation/landlord";
import type { AuthContext } from "@/server/auth/rbac";
import { recordAudit } from "@/server/lib/audit";
import { createOrganizationWithVerification } from "./create-organization-with-verification";

/**
 * "Devenir bailleur" — opens a letting activity on an existing account.
 *
 * A thin wrapper around `createOrganizationWithVerification()` (PRD V1.1,
 * R71-R74 — the same circuit a tenant signing up as a company goes through,
 * so a verified company counts for both). What is specific to THIS path:
 * `activityType` is always set (OWNER vs OPERATOR decides which documents
 * the dossier requires — requirements.ts) and `isLandlord` is unlocked.
 *
 * The mode is NOT switched here. Unlocking the capability and choosing to
 * use it are separate acts; the caller switches afterwards, through
 * `switchMode()`, which is the same path any later switch takes.
 */
export async function becomeLandlord({
  actor,
  input,
}: {
  actor: AuthContext;
  input: BecomeLandlordInput;
}) {
  const identity =
    input.holderType === "COMPANY"
      ? {
          holderType: "COMPANY" as const,
          legalName: input.legalName,
          displayName: input.displayName,
          siret: input.siret,
          siren: input.siren,
          vatNumber: input.vatNumber,
          legalRepresentativeName: input.legalRepresentativeName,
          contactEmail: input.contactEmail,
          address: input.address,
          city: input.city,
          postalCode: input.postalCode,
        }
      : {
          holderType: "INDIVIDUAL" as const,
          displayName: input.displayName,
          contactEmail: input.contactEmail,
          address: input.address,
          city: input.city,
          postalCode: input.postalCode,
        };

  const organization = await createOrganizationWithVerification({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorName: actor.name,
    identity,
    activityType: input.activityType,
    isRealEstateProfessional: input.holderType === "COMPANY" ? input.isRealEstateProfessional : false,
    grantLandlordCapability: true,
  });

  await recordAudit({
    event: "landlord.activity_opened",
    actorUserId: actor.userId,
    organizationId: organization.id,
    metadata: { holder_type: organization.holderType, verification_id: organization.verificationId },
  });

  return organization;
}
