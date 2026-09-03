import type { Prisma } from "@/generated/prisma/client";
import type { LandlordActivityType } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * Creates the DRAFT dossier for an organization's landlord activity.
 *
 * Accepts an optional transaction client so `become-landlord.ts` can call
 * this INSIDE the same transaction that creates the Organization and its
 * OWNER membership — an organization created without a dossier would look
 * exactly as complete as one that has been through verification, and
 * nothing downstream would notice the difference until an admin went
 * looking for a review queue entry that does not exist.
 */
export async function createDraftVerification(
  client: Prisma.TransactionClient | typeof prisma,
  params: {
    organizationId: string;
    requestedByProfileId: string;
    activityType: LandlordActivityType;
    isRealEstateProfessional?: boolean;
  }
) {
  return client.landlordVerification.create({
    data: {
      organizationId: params.organizationId,
      requestedByProfileId: params.requestedByProfileId,
      activityType: params.activityType,
      isRealEstateProfessional: params.isRealEstateProfessional ?? false,
      status: "DRAFT",
    },
  });
}

/**
 * Returns the organization's current dossier, creating a DRAFT one if none
 * exists yet.
 *
 * This is what makes `POST /api/verifications` idempotent and safe to call
 * even though the normal journey already creates a dossier inside
 * `becomeLandlord()`: a second call returns the existing one unchanged
 * rather than creating a duplicate. It also covers the edge cases the
 * automatic path cannot — a dossier that reached EXPIRED and needs a fresh
 * one, or (defensively) a pre-Phase-3 organization the migration's backfill
 * somehow missed.
 *
 * `activityType` is required only for the create branch: an existing
 * dossier's activity type is not silently overwritten by a later call that
 * happens to disagree with it.
 */
export async function getOrCreateDraftVerification(params: {
  organizationId: string;
  requestedByProfileId: string;
  activityType: LandlordActivityType;
  isRealEstateProfessional?: boolean;
}) {
  const latest = await prisma.landlordVerification.findFirst({
    where: { organizationId: params.organizationId },
    orderBy: { createdAt: "desc" },
  });

  if (latest && latest.status !== "EXPIRED") {
    return { verification: latest, created: false as const };
  }

  const created = await createDraftVerification(prisma, params);
  return { verification: created, created: true as const };
}
