import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { unpublishSpace } from "@/server/domains/organizations/moderate-space";
import type { CreateReportInput } from "@/lib/validation/reports";

/**
 * Notice mechanism. Anyone, signed in or not, can report a PUBLISHED space.
 * The report waits in the admin "À traiter" queue; an admin either hides the
 * space with a reason (reusing unpublishSpace: status, e-mail to the landlord,
 * audit) or dismisses the report. Both are recorded on the report itself.
 */
export async function createContentReport(slug: string, input: CreateReportInput, reporterProfileId: string | null) {
  const space = await prisma.space.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { id: true, organizationId: true },
  });
  if (!space) throw new NotFoundError("Espace introuvable");

  const report = await prisma.contentReport.create({
    data: {
      spaceId: space.id,
      reason: input.reason,
      message: input.message,
      reporterEmail: input.email ?? null,
      reporterProfileId,
    },
    select: { id: true },
  });
  await recordAudit({
    event: "space.reported",
    organizationId: space.organizationId,
    metadata: { spaceId: space.id, reportId: report.id, reason: input.reason },
  });
  return report;
}

async function loadPending(reportId: string) {
  const report = await prisma.contentReport.findUnique({
    where: { id: reportId },
    select: { id: true, status: true, spaceId: true, space: { select: { status: true, organizationId: true } } },
  });
  if (!report) throw new NotFoundError("Signalement introuvable");
  if (report.status !== "PENDING") throw new ConflictError("Ce signalement a déjà été traité.");
  return report;
}

/** Hide the reported space (reason required, sent to the landlord) and close
 * every pending report about it: the decision covers them all. */
export async function actOnReportBySpaceHide(actorUserId: string, reportId: string, reason: string) {
  const report = await loadPending(reportId);
  if (report.space.status === "PUBLISHED") {
    await unpublishSpace(actorUserId, report.spaceId, reason);
  }
  await prisma.contentReport.updateMany({
    where: { spaceId: report.spaceId, status: "PENDING" },
    data: { status: "ACTIONED", handledAt: new Date(), handledByProfileId: actorUserId, resolution: reason },
  });
  await recordAudit({
    event: "report.actioned",
    organizationId: report.space.organizationId,
    metadata: { reportId, spaceId: report.spaceId },
  });
}

/** Dismiss one report (no action on the space). */
export async function dismissReport(actorUserId: string, reportId: string, note?: string | null) {
  const report = await loadPending(reportId);
  const updated = await prisma.contentReport.updateMany({
    where: { id: reportId, status: "PENDING" },
    data: { status: "DISMISSED", handledAt: new Date(), handledByProfileId: actorUserId, resolution: note ?? null },
  });
  if (updated.count === 0) throw new ConflictError("Ce signalement a déjà été traité.");
  await recordAudit({
    event: "report.dismissed",
    organizationId: report.space.organizationId,
    metadata: { reportId, spaceId: report.spaceId },
  });
}
