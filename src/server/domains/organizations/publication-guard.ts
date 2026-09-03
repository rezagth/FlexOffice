import type { OrganizationStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { ForbiddenError, NotFoundError } from "@/server/lib/errors";
import { logEvent } from "@/server/lib/logger";

/**
 * Whether an organization is allowed to have its spaces visible publicly.
 *
 * THE GAP THIS CLOSES
 * `Organization.status` existed, was displayed in the admin back office, and
 * was read by no business rule at all. `listPublishedSpaces()` filtered on
 * `Space.status = PUBLISHED` and nothing else, so a suspended organization
 * kept its listings live and bookable. On a marketplace whose stated core is
 * trust between companies, suspension that does not suspend anything is the
 * worst kind of control: it looks like one.
 *
 * THE PHASE 1 THRESHOLD, AND WHY IT IS NOT `VERIFIED` ONLY
 * Blocking everything but VERIFIED is where this ends up, but it cannot land
 * before the verification workflow exists: there is no way for an
 * organization to *become* verified today except a manual database write, so
 * the strict rule would silently hide every real signup and look like a bug.
 * Phase 1 therefore enforces the half that is unambiguous — a SUSPENDED
 * organization publishes nothing — and Phase 2 tightens the same constant
 * once `Verification` gives organizations a route to VERIFIED.
 *
 * Changing the policy means editing this one list. Nothing else in the
 * codebase should compare an OrganizationStatus by hand.
 */
export const STATUSES_ALLOWED_TO_PUBLISH: readonly OrganizationStatus[] = [
  "PENDING_VERIFICATION",
  "VERIFIED",
];

/** Statuses excluded from every public surface. */
export const STATUSES_BLOCKED_FROM_PUBLISHING: readonly OrganizationStatus[] = [
  "SUSPENDED",
];

export function canOrganizationPublish(status: OrganizationStatus): boolean {
  return STATUSES_ALLOWED_TO_PUBLISH.includes(status);
}

/**
 * Asserts that `organizationId` may publish, and returns it.
 *
 * Call this from any handler that publishes, republishes or otherwise makes a
 * space publicly visible. It reads the status from the database rather than
 * accepting it from the caller, so a client cannot assert its own eligibility.
 *
 * 404 for an unknown organization, 403 for a blocked one: the caller already
 * proved access to that organization via `requireOrganizationAccess()`, so
 * there is nothing left to leak by saying it is suspended — and telling them
 * plainly is the difference between a support ticket and a silent failure.
 */
export async function assertOrganizationCanPublish(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, status: true, name: true },
  });

  if (!organization) {
    throw new NotFoundError("Organisation introuvable");
  }

  if (!canOrganizationPublish(organization.status)) {
    logEvent({
      event: "publication.refused",
      organization_id: organization.id,
      organization_status: organization.status,
    });
    throw new ForbiddenError(
      "Cette organisation ne peut pas publier d'espace : son compte est suspendu."
    );
  }

  return organization;
}
