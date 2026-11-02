import { listVerificationsForAdmin } from "@/server/domains/verification/get";
import { listDomiciliationRequestsForAdmin } from "@/server/domains/organizations/domiciliation";
import { listPendingPromotionsForAdmin } from "@/server/domains/promotions/admin";
import { prisma } from "@/server/db/prisma";
import { SPACE_TYPE_LABELS, formatCents } from "@/lib/format";
import { CONTENT_REPORT_REASON_LABELS } from "@/lib/validation/reports";

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

export type ReviewQueueKind = "organization" | "space" | "verification" | "domiciliation" | "promotion" | "report";

export type ReviewQueueItem = {
  kind: ReviewQueueKind;
  id: string;
  organizationName: string;
  summary: string;
  submittedAt: Date;
  overdue: boolean;
  href: string;
  /** What the admin needs to judge the request without leaving the queue
   * (only for the kinds that can be decided right there). */
  details?: Array<{ label: string; value: string }>;
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
  const [verifications, domiciliations, promotions, spaces, organizations, reports] = await Promise.all([
    listVerificationsForAdmin("ALL"),
    listDomiciliationRequestsForAdmin(),
    listPendingPromotionsForAdmin(),
    // A space submitted for validation (or republished after an edit of a
    // visible field) waits here until an admin decides — it used to be
    // missing from this screen, so a submitted listing looked like "nothing
    // to do". `updatedAt` is the closest thing to a submission time: the
    // status change is the last write before it starts waiting.
    prisma.space.findMany({
      where: { status: "PENDING_REVIEW" },
      select: {
        id: true,
        name: true,
        type: true,
        city: true,
        address: true,
        postalCode: true,
        capacity: true,
        description: true,
        halfDayPriceCents: true,
        dayPriceCents: true,
        updatedAt: true,
        organization: { select: { name: true } },
        _count: { select: { spacePhotos: true } },
      },
    }),
    // A company waiting for validation that does not let spaces (a
    // tenant-only company): there is no other screen where it would show up,
    // and it cannot book until an admin decides. Every company gets a DRAFT
    // dossier at signup, so "has a dossier" cannot be the test: a landlord
    // company is told apart by a member holding the landlord capability, and
    // one whose dossier is already submitted appears as "verification".
    prisma.organization.findMany({
      where: {
        status: "PENDING_VERIFICATION",
        memberships: { none: { status: "ACTIVE", profile: { isLandlord: true } } },
        verifications: { none: { status: { in: ["PENDING_REVIEW", "IN_REVIEW"] } } },
      },
      select: {
        id: true,
        name: true,
        legalName: true,
        siret: true,
        email: true,
        address: true,
        city: true,
        postalCode: true,
        createdAt: true,
      },
    }),
    // Notices about published listings (illegal, not authorized…): they wait
    // here until an admin hides the space or dismisses the report.
    prisma.contentReport.findMany({
      where: { status: "PENDING" },
      select: {
        id: true,
        reason: true,
        message: true,
        reporterEmail: true,
        createdAt: true,
        space: { select: { name: true, slug: true, organization: { select: { name: true } } } },
      },
    }),
  ]);

  const now = Date.now();
  const items: ReviewQueueItem[] = [];

  for (const s of spaces) {
    items.push({
      kind: "space",
      id: s.id,
      organizationName: s.organization.name,
      summary: `${s.name} · ${SPACE_TYPE_LABELS[s.type] ?? s.type} · ${s.city}`,
      submittedAt: s.updatedAt,
      overdue: isOverdue(s.updatedAt, now),
      href: "/admin/listings",
      details: [
        { label: "Adresse", value: `${s.address}, ${s.postalCode} ${s.city}` },
        { label: "Capacité", value: `${s.capacity} personne${s.capacity > 1 ? "s" : ""}` },
        { label: "Tarifs", value: `Demi-journée ${formatCents(s.halfDayPriceCents)} · Journée ${formatCents(s.dayPriceCents)}` },
        { label: "Photos", value: s._count.spacePhotos === 0 ? "Aucune photo" : `${s._count.spacePhotos} photo(s)` },
        { label: "Description", value: s.description },
      ],
    });
  }

  for (const r of reports) {
    items.push({
      kind: "report",
      id: r.id,
      organizationName: r.space.organization.name,
      summary: `Signalement · ${r.space.name} · ${CONTENT_REPORT_REASON_LABELS[r.reason]}`,
      submittedAt: r.createdAt,
      overdue: isOverdue(r.createdAt, now),
      href: `/spaces/${r.space.slug}`,
      details: [
        { label: "Motif", value: CONTENT_REPORT_REASON_LABELS[r.reason] },
        { label: "Contact du signalant", value: r.reporterEmail ?? "Anonyme" },
        { label: "Description", value: r.message },
      ],
    });
  }

  for (const o of organizations) {
    items.push({
      kind: "organization",
      id: o.id,
      organizationName: o.name,
      summary: "Société à valider",
      submittedAt: o.createdAt,
      overdue: isOverdue(o.createdAt, now),
      href: "/admin/organizations",
      details: [
        { label: "Raison sociale", value: o.legalName ?? o.name },
        { label: "SIRET", value: o.siret ?? "Non renseigné" },
        { label: "Adresse", value: `${o.address}, ${o.postalCode} ${o.city}` },
        { label: "Email", value: o.email },
      ],
    });
  }

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
