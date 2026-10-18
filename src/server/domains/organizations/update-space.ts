import type { Space } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { pricingViolation, type UpdateSpaceInput } from "@/lib/validation/spaces";

/**
 * Fields a client sees on the public listing and that an administrator
 * approved. Changing any of them on a PUBLISHED space sends it back to
 * moderation (FCT-15 / SEC-09): otherwise a listing could be approved as a
 * meeting room in Paris at 90 € and quietly become something else.
 *
 * Not in the list, on purpose: amenities, access instructions (only shown
 * after a confirmed booking), the time zone, photos (separate upload flow).
 */
export const MODERATED_SPACE_FIELDS = [
  "name",
  "description",
  "type",
  "address",
  "city",
  "postalCode",
  "capacity",
  "halfDayPriceCents",
  "dayPriceCents",
  "discountPercent",
] as const satisfies readonly (keyof UpdateSpaceInput & keyof Space)[];

/** Moderated fields whose value actually changes. Re-sending an unchanged
 * value (the edit form posts every field) is not a change. */
export function changedModeratedFields(existing: Space, input: UpdateSpaceInput): string[] {
  return MODERATED_SPACE_FIELDS.filter((field) => {
    if (!(field in input) || input[field] === undefined) return false;
    const next = input[field] ?? null;
    const current = existing[field] ?? null;
    return next !== current;
  });
}

/**
 * Applies an edit to a space the caller has already been authorized for.
 * Shared by both edit paths (organization-scoped `/api/partner/spaces/[id]`
 * and property-scoped `/api/properties/[id]/spaces/[spaceId]`) so the
 * pricing rules and the re-moderation rule cannot drift apart.
 *
 * DECISION — a published space whose public fields change goes back to
 * PENDING_REVIEW and therefore LEAVES the catalogue (search, public page,
 * new bookings all require PUBLISHED) until an administrator approves it
 * again. Keeping the old version online would mean storing two versions of
 * the listing; showing the new one unreviewed is the hole being closed.
 * Bookings already made are untouched.
 *
 * The write is conditional on the status read: if moderation changed it in
 * between (an admin unpublishing it), the edit is refused rather than
 * silently overriding that decision.
 */
export async function applySpaceUpdate(
  existing: Space,
  input: UpdateSpaceInput,
  audit: { actorUserId?: string | null; organizationId: string | null }
) {
  const violation = pricingViolation({
    halfDayPriceCents: input.halfDayPriceCents ?? existing.halfDayPriceCents,
    dayPriceCents: input.dayPriceCents ?? existing.dayPriceCents,
    discountPercent: input.discountPercent === undefined ? existing.discountPercent : input.discountPercent,
  });
  if (violation) throw new ValidationError(violation.message);

  const changed = changedModeratedFields(existing, input);
  const backToReview = existing.status === "PUBLISHED" && changed.length > 0;

  const result = await prisma.space.updateMany({
    where: { id: existing.id, status: existing.status },
    data: { ...input, ...(backToReview ? { status: "PENDING_REVIEW" as const } : {}) },
  });
  if (result.count === 0) {
    throw new ConflictError("L'annonce a changé entre-temps. Rechargez la page puis réessayez.");
  }

  await recordAudit({
    event: "space.updated",
    actorUserId: audit.actorUserId ?? null,
    organizationId: audit.organizationId,
    metadata: { spaceId: existing.id, changedModeratedFields: changed },
  });
  if (backToReview) {
    await recordAudit({
      event: "space.back_to_review",
      actorUserId: audit.actorUserId ?? null,
      organizationId: audit.organizationId,
      metadata: { spaceId: existing.id, changedFields: changed },
    });
  }

  return prisma.space.findUniqueOrThrow({ where: { id: existing.id } });
}

/** Edits a space owned by the calling partner's organization. Scoped by
 * organizationId on the read that establishes ownership before any write. */
export async function updateSpace(
  organizationId: string,
  spaceId: string,
  input: UpdateSpaceInput,
  actorUserId?: string
) {
  const existing = await prisma.space.findFirst({ where: { id: spaceId, organizationId } });
  if (!existing) throw new NotFoundError("Space not found");
  return applySpaceUpdate(existing, input, { actorUserId, organizationId });
}
