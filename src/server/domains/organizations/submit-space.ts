import { prisma } from "@/server/db/prisma";
import { ConflictError, LegalAcceptanceRequiredError, NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { assertProfileIsComplete } from "@/server/domains/users/profile-completion-guard";
import { PARTNER_TERMS_VERSION } from "@/lib/legal-versions";

/** What the landlord ticked on the submit screen. */
export type SubmitConsent = {
  /** Partner CGV, including the billing mandate (article 6). */
  acceptPartnerTerms?: boolean;
  /** "I have the right to let this place" — asked at every submission. */
  certifyRightToLet?: boolean;
};

/** True when this organization has already accepted the partner CGV in force. */
export function hasAcceptedCurrentPartnerTerms(organization: { partnerTermsVersion: string | null }) {
  return organization.partnerTermsVersion === PARTNER_TERMS_VERSION;
}

/** For the submit screen: must the landlord tick the partner CGV this time? */
export async function organizationNeedsPartnerTerms(organizationId: string): Promise<boolean> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { partnerTermsVersion: true },
  });
  return !organization || !hasAcceptedCurrentPartnerTerms(organization);
}

/** Partner submits a DRAFT (or previously REJECTED) space for admin
 * review. Conditional update so a double submit is a 409, not a silent
 * second transition.
 *
 * R62: this is the landlord's own "publish" action — the one place their
 * own profile completeness can be checked against the actor rather than
 * against the organization (which has no phone/need/holderType of its own).
 * Checked before the state transition, so an incomplete profile never even
 * reaches admin review.
 *
 * Legal: it is also where the landlord (1) accepts the partner CGV and the
 * billing mandate, once per version, and (2) certifies the right to let the
 * place, for this space. Both are refused server-side when missing, whatever
 * the UI showed, and recorded with date, version and author as proof. */
export async function submitSpaceForReview(
  organizationId: string,
  spaceId: string,
  actorUserId: string,
  consent: SubmitConsent = {}
) {
  await assertProfileIsComplete(actorUserId, "publier un espace");

  const space = await prisma.space.findFirst({ where: { id: spaceId, organizationId } });
  if (!space) throw new NotFoundError("Space not found");

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { partnerTermsVersion: true },
  });
  if (!organization) throw new NotFoundError("Organisation introuvable");

  const needsTerms = !hasAcceptedCurrentPartnerTerms(organization);
  if (needsTerms && consent.acceptPartnerTerms !== true) {
    throw new LegalAcceptanceRequiredError(
      "Pour publier, vous devez accepter les conditions générales de vente partenaires, qui incluent le mandat de facturation."
    );
  }
  if (consent.certifyRightToLet !== true) {
    throw new LegalAcceptanceRequiredError(
      "Pour publier, vous devez certifier que vous avez le droit de proposer ce lieu (propriétaire, ou autorisé à le sous-louer)."
    );
  }

  const now = new Date();
  const updated = await prisma.space.updateMany({
    where: { id: spaceId, organizationId, status: { in: ["DRAFT", "REJECTED"] } },
    data: {
      status: "PENDING_REVIEW",
      rightToLetCertifiedAt: now,
      rightToLetCertifiedByProfileId: actorUserId,
    },
  });
  if (updated.count === 0) {
    throw new ConflictError("This space cannot be submitted in its current state");
  }

  if (needsTerms) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        partnerTermsAcceptedAt: now,
        partnerTermsVersion: PARTNER_TERMS_VERSION,
        partnerTermsAcceptedByProfileId: actorUserId,
      },
    });
    await recordAudit({
      event: "organization.partner_terms_accepted",
      organizationId,
      metadata: { version: PARTNER_TERMS_VERSION, acceptedBy: actorUserId },
    });
  }

  await recordAudit({
    event: "space.submitted",
    organizationId,
    metadata: { spaceId, rightToLetCertified: true, partnerTermsVersion: PARTNER_TERMS_VERSION },
  });
}
