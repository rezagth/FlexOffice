import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { logError, logEvent } from "@/server/lib/logger";
import { notifyReviewInvitation, notifyReviewReceived } from "@/server/domains/notifications/send-notifications";
import type { CreateReviewInput } from "@/lib/validation/reviews";
import { REVIEW_WINDOW_DAYS } from "@/lib/review-policy";

/**
 * Reviews — one per booking, by the client who made it.
 *
 * Rules (decided 07/10/2026, adjustable here):
 *   - only once the booking is over: COMPLETED, or CONFIRMED with its slot
 *     ended (the maintenance job may not have run yet);
 *   - within REVIEW_WINDOW_DAYS after the end of the slot;
 *   - one review per booking (unique index), not editable afterwards — what
 *     the landlord answered must keep answering the same text;
 *   - the landlord of the booking may answer once, publicly;
 *   - an administrator may hide a review with a reason, and show it again.
 *     Nothing is ever deleted: a hidden review keeps its text for disputes.
 *
 * Every lookup is scoped by a value from the verified session (the client's
 * userId, the landlord's organizationId): another account's booking or
 * review is a 404, never a 403 that would confirm it exists.
 */

export { REVIEW_WINDOW_DAYS };
const DAY_MS = 24 * 60 * 60 * 1000;

/** Invitations go out for bookings that ended at most this long ago, so
 * switching the feature on never mails clients about old bookings. */
const INVITATION_LOOKBACK_DAYS = 7;

type ReviewableBooking = { status: string; endsAt: Date };

/** Whether the booking is in the review window, as of `now`. Pure, shared
 * by the domain and the bookings page (which shows the button). */
export function reviewEligibility(
  booking: ReviewableBooking,
  now: Date = new Date()
): "ELIGIBLE" | "NOT_FINISHED" | "WINDOW_CLOSED" | "NOT_REVIEWABLE" {
  const ended = booking.endsAt.getTime() <= now.getTime();
  if (booking.status !== "COMPLETED" && !(booking.status === "CONFIRMED" && ended)) {
    return booking.status === "CONFIRMED" ? "NOT_FINISHED" : "NOT_REVIEWABLE";
  }
  if (now.getTime() - booking.endsAt.getTime() > REVIEW_WINDOW_DAYS * DAY_MS) return "WINDOW_CLOSED";
  return "ELIGIBLE";
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createReview(userId: string, bookingId: string, input: CreateReviewInput) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, clientUserId: userId },
    select: { id: true, status: true, endsAt: true, spaceId: true, organizationId: true, review: { select: { id: true } } },
  });
  if (!booking) throw new NotFoundError("Réservation introuvable.");
  if (booking.review) throw new ConflictError("Vous avez déjà donné votre avis sur cette réservation.");

  switch (reviewEligibility(booking)) {
    case "NOT_FINISHED":
      throw new ConflictError("Vous pourrez donner votre avis une fois la réservation terminée.");
    case "WINDOW_CLOSED":
      throw new ConflictError(
        `Les avis sont possibles pendant ${REVIEW_WINDOW_DAYS} jours après la fin de la réservation.`
      );
    case "NOT_REVIEWABLE":
      throw new ConflictError("Seule une réservation qui a eu lieu peut recevoir un avis.");
  }

  let review;
  try {
    review = await prisma.spaceReview.create({
      data: {
        bookingId: booking.id,
        spaceId: booking.spaceId,
        organizationId: booking.organizationId,
        authorProfileId: userId,
        rating: input.rating,
        comment: input.comment,
      },
      select: { id: true, rating: true },
    });
  } catch (error) {
    // Two submissions racing: the unique index decides, the loser is told.
    if (isUniqueViolation(error)) {
      throw new ConflictError("Vous avez déjà donné votre avis sur cette réservation.");
    }
    throw error;
  }

  await recordAudit({
    event: "review.created",
    actorUserId: userId,
    organizationId: booking.organizationId,
    metadata: { review_id: review.id, booking_id: booking.id, rating: review.rating },
  });
  await notifyReviewReceived(review.id);
  return review;
}

export async function replyToReview(input: {
  organizationId: string;
  actorUserId: string;
  reviewId: string;
  reply: string;
}) {
  // Claim with a conditional update: a second reply (or a double click)
  // matches no row instead of overwriting the first.
  const claimed = await prisma.spaceReview.updateMany({
    where: { id: input.reviewId, organizationId: input.organizationId, landlordReply: null },
    data: { landlordReply: input.reply, landlordRepliedAt: new Date() },
  });
  if (claimed.count === 0) {
    const exists = await prisma.spaceReview.findFirst({
      where: { id: input.reviewId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundError("Avis introuvable.");
    throw new ConflictError("Vous avez déjà répondu à cet avis.");
  }
  await recordAudit({
    event: "review.replied",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    metadata: { review_id: input.reviewId },
  });
  return { replied: true };
}

export async function setReviewHidden(input: {
  adminUserId: string;
  reviewId: string;
  hidden: boolean;
  reason?: string;
}) {
  const review = await prisma.spaceReview.findUnique({
    where: { id: input.reviewId },
    select: { id: true, organizationId: true, hiddenAt: true },
  });
  if (!review) throw new NotFoundError("Avis introuvable.");
  if (input.hidden === (review.hiddenAt !== null)) {
    throw new ConflictError(input.hidden ? "Cet avis est déjà masqué." : "Cet avis est déjà visible.");
  }
  await prisma.spaceReview.update({
    where: { id: review.id },
    data: input.hidden
      ? { hiddenAt: new Date(), hiddenReason: input.reason ?? null }
      : { hiddenAt: null, hiddenReason: null },
  });
  await recordAudit({
    event: input.hidden ? "review.hidden" : "review.unhidden",
    actorUserId: input.adminUserId,
    organizationId: review.organizationId,
    metadata: { review_id: review.id, ...(input.reason ? { reason: input.reason } : {}) },
  });
  return { hidden: input.hidden };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** "Camille D." — a first name and an initial, never the full name or the
 * company: the review is public. An erased account shows no name at all. */
export function reviewAuthorLabel(author: { name: string; deletedAt: Date | null }): string {
  if (author.deletedAt) return "Ancien utilisateur";
  const parts = author.name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Client";
  const [first, ...rest] = parts;
  const initial = rest.length ? ` ${rest[rest.length - 1][0].toUpperCase()}.` : "";
  return `${first}${initial}`;
}

export type ReviewSummary = { average: number; count: number };

/** Average (one decimal) and count of the VISIBLE reviews of each space. */
export async function getReviewSummaries(spaceIds: string[]): Promise<Map<string, ReviewSummary>> {
  const map = new Map<string, ReviewSummary>();
  if (spaceIds.length === 0) return map;
  const rows = await prisma.spaceReview.groupBy({
    by: ["spaceId"],
    where: { spaceId: { in: spaceIds }, hiddenAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });
  for (const row of rows) {
    map.set(row.spaceId, {
      average: Math.round((row._avg.rating ?? 0) * 10) / 10,
      count: row._count._all,
    });
  }
  return map;
}

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  authorLabel: string;
  createdAt: Date;
  landlordReply: string | null;
  landlordRepliedAt: Date | null;
};

/** The visible reviews of a published space, newest first. */
export async function listSpaceReviews(spaceId: string, take = 20): Promise<PublicReview[]> {
  const reviews = await prisma.spaceReview.findMany({
    where: { spaceId, hiddenAt: null },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      landlordReply: true,
      landlordRepliedAt: true,
      author: { select: { name: true, deletedAt: true } },
    },
  });
  return reviews.map(({ author, ...review }) => ({ ...review, authorLabel: reviewAuthorLabel(author) }));
}

/** Every review of the organization's spaces, hidden ones included (the
 * landlord sees that a review was hidden, and why). */
export function listOrganizationReviews(organizationId: string) {
  return prisma.spaceReview.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      landlordReply: true,
      landlordRepliedAt: true,
      hiddenAt: true,
      space: { select: { name: true, slug: true } },
      author: { select: { name: true, deletedAt: true } },
    },
  });
}

export function listReviewsForAdmin(filter: { hidden?: boolean } = {}) {
  return prisma.spaceReview.findMany({
    where: filter.hidden === undefined ? {} : { hiddenAt: filter.hidden ? { not: null } : null },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      landlordReply: true,
      hiddenAt: true,
      hiddenReason: true,
      space: { select: { name: true, slug: true } },
      organization: { select: { name: true } },
      author: { select: { name: true, email: true, deletedAt: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// Scheduled: "leave a review" invitations
// ---------------------------------------------------------------------------

/**
 * Sends the review invitation for bookings that ended recently, have no
 * review and were never invited. Each booking is claimed (review_invited_at)
 * before its e-mail goes out, so two overlapping runs send it once.
 */
export async function sendReviewInvitations(now: Date = new Date()) {
  const candidates = await prisma.booking.findMany({
    where: {
      status: "COMPLETED",
      reviewInvitedAt: null,
      review: null,
      endsAt: { lte: now, gte: new Date(now.getTime() - INVITATION_LOOKBACK_DAYS * DAY_MS) },
      clientUser: { deletedAt: null },
    },
    select: { id: true },
    take: 200,
  });

  let sent = 0;
  for (const { id } of candidates) {
    try {
      const claim = await prisma.booking.updateMany({
        where: { id, reviewInvitedAt: null },
        data: { reviewInvitedAt: now },
      });
      if (claim.count === 0) continue;
      await notifyReviewInvitation(id, REVIEW_WINDOW_DAYS);
      sent += 1;
    } catch (error) {
      logError({ event: "review.invitation_failed", error, booking_id: id });
    }
  }
  if (candidates.length > 0) logEvent({ event: "review.invitation_run", candidates: candidates.length, sent });
  return { candidates: candidates.length, sent };
}
