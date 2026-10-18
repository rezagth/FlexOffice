import { listVerificationsForAdmin } from "@/server/domains/verification/get";
import { listDomiciliationRequestsForAdmin } from "@/server/domains/organizations/domiciliation";
import { listPendingPromotionsForAdmin } from "@/server/domains/promotions/admin";
import { formatCents } from "@/lib/format";

/** PRD V1.1, R66 — a single screen aggregating everything an admin has to
 * decide on: verifications awaiting a first look or already claimed,
 * domiciliation requests not yet settled, and promotions pending review.
 * "Documents en attente" (R66's own wording) is not a fourth, separate data
 * source — the only uploaded documents an admin ever reviews are a
 * verification dossier's own, already covered by the verification bucket.
 *
 * Read-only aggregator: it links to each item's own existing screen
 * (verifications/domiciliations/promotions already have their own
 * moderation actions) rather than re-implementing three different
 * approve/reject flows here.
 */
export const REVIEW_QUEUE_OVERDUE_HOURS = 48;

export type ReviewQueueKind = "verification" | "domiciliation" | "promotion";

export type ReviewQueueItem = {
  kind: ReviewQueueKind;
  id: string;
  organizationName: string;
  summary: string;
  submittedAt: Date;
  overdue: boolean;
  href: string;
};

function isOverdue(submittedAt: Date, now: number): boolean {
  return now - submittedAt.getTime() > REVIEW_QUEUE_OVERDUE_HOURS * 60 * 60 * 1000;
}

const VERIFICATION_ACTIVITY_LABELS: Record<string, string> = {
  OWNER: "Propriétaire",
  OPERATOR: "Exploitant",
};

const DOMICILIATION_KIND_LABELS: Record<string, string> = {
  MAKOMSPACE: "chez MakomSpace",
  THIRD_PARTY: "déjà domicilié ailleurs",
};

function promotionSummary(p: { discountType: "PERCENTAGE" | "FIXED_AMOUNT"; discountPercent: number | null; discountAmountCents: number | null }): string {
  return p.discountType === "PERCENTAGE" ? `-${p.discountPercent} %` : `-${formatCents(p.discountAmountCents ?? 0)}`;
}

export async function listReviewQueue(): Promise<ReviewQueueItem[]> {
  const [verifications, domiciliations, promotions] = await Promise.all([
    listVerificationsForAdmin("ALL"),
    listDomiciliationRequestsForAdmin(),
    listPendingPromotionsForAdmin(),
  ]);

  const now = Date.now();
  const items: ReviewQueueItem[] = [];

  for (const v of verifications) {
    if (v.status !== "PENDING_REVIEW" && v.status !== "IN_REVIEW") continue;
    // A submitted dossier always has submittedAt — createdAt is only a
    // defensive fallback for a row that somehow reached this status without
    // it being stamped.
    const submittedAt = v.submittedAt ?? v.createdAt;
    items.push({
      kind: "verification",
      id: v.id,
      organizationName: v.organization.name,
      summary: (v.activityType && VERIFICATION_ACTIVITY_LABELS[v.activityType]) || "Dossier",
      submittedAt,
      overdue: isOverdue(submittedAt, now),
      href: "/admin/verifications",
    });
  }

  for (const d of domiciliations) {
    if (d.status !== "REQUESTED" && d.status !== "IN_PROGRESS") continue;
    items.push({
      kind: "domiciliation",
      id: d.id,
      organizationName: d.organization.name,
      summary: DOMICILIATION_KIND_LABELS[d.kind] ?? d.kind,
      submittedAt: d.createdAt,
      overdue: isOverdue(d.createdAt, now),
      href: "/admin/domiciliations",
    });
  }

  for (const p of promotions) {
    const submittedAt = p.submittedAt ?? p.createdAt;
    items.push({
      kind: "promotion",
      id: p.id,
      organizationName: p.organization.name,
      summary: promotionSummary(p),
      submittedAt,
      overdue: p.overdue,
      href: "/admin/promotions",
    });
  }

  items.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  return items;
}
