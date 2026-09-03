import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import type { CreatePropertyInput } from "@/lib/validation/properties";

/**
 * Creates a Property for the caller's active organization, and — by
 * default — makes that organization both its OWNER (100%) and its
 * OPERATOR in the same transaction.
 *
 * Cumulating both is the normal case (Étape 8: "un même acteur peut
 * cumuler plusieurs fonctions") — a landlord listing their own building is
 * both, and splitting the roles apart (the agency scenario: owner ≠
 * operator ≠ manager) is a deliberate edit afterwards via
 * owners.ts/operators.ts/managers.ts, not a choice this form asks for.
 *
 * Never trusts an owner/organization id from the caller — `organizationId`
 * and `createdByProfileId` both come from the verified session
 * (`requirePropertyOrg()`), never the request body.
 */
export async function createProperty(
  organizationId: string,
  createdByProfileId: string,
  input: CreatePropertyInput
) {
  const property = await prisma.$transaction(async (tx) => {
    const created = await tx.property.create({
      data: {
        label: input.label,
        propertyType: input.propertyType,
        description: input.description,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        postalCode: input.postalCode,
        city: input.city,
        region: input.region,
        country: input.country ?? "FR",
        latitude: input.latitude,
        longitude: input.longitude,
        createdByProfileId,
      },
    });
    await tx.propertyOwner.create({
      data: { propertyId: created.id, organizationId, ownershipShareBasisPoints: 10000 },
    });
    await tx.propertyOperator.create({
      data: { propertyId: created.id, organizationId },
    });
    return created;
  });

  await recordAudit({
    event: "property.created",
    actorUserId: createdByProfileId,
    organizationId,
    metadata: { propertyId: property.id },
  });
  await recordAudit({
    event: "property.owner_added",
    actorUserId: createdByProfileId,
    organizationId,
    metadata: { propertyId: property.id, organizationId },
  });
  await recordAudit({
    event: "property.operator_added",
    actorUserId: createdByProfileId,
    organizationId,
    metadata: { propertyId: property.id, organizationId },
  });

  return property;
}
