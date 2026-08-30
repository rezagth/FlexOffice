import { prisma } from "@/server/db/prisma";
import { NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import type { OpeningHoursWeekInput } from "@/lib/validation/spaces";

/** Replaces a space's whole weekly schedule in one transaction — partial
 * per-day edits would leave the calendar inconsistent mid-update. The
 * [spaceId, weekday] unique constraint is the safety net if a duplicate
 * weekday ever slips past validation. */
export async function replaceOpeningHours(
  organizationId: string,
  spaceId: string,
  hours: OpeningHoursWeekInput
) {
  const space = await prisma.space.findFirst({ where: { id: spaceId, organizationId } });
  if (!space) throw new NotFoundError("Space not found");

  await prisma.$transaction([
    prisma.spaceOpeningHours.deleteMany({ where: { spaceId } }),
    prisma.spaceOpeningHours.createMany({
      data: hours.map((h) => ({ spaceId, weekday: h.weekday, opensAt: h.opensAt, closesAt: h.closesAt })),
    }),
  ]);

  await recordAudit({ event: "space.opening_hours_updated", organizationId, metadata: { spaceId } });
}

export async function listOpeningHours(organizationId: string, spaceId: string) {
  const space = await prisma.space.findFirst({ where: { id: spaceId, organizationId } });
  if (!space) throw new NotFoundError("Space not found");
  return prisma.spaceOpeningHours.findMany({ where: { spaceId }, orderBy: { weekday: "asc" } });
}
