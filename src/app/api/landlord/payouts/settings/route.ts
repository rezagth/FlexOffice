import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgCapability } from "@/server/domains/organizations/require-org-capability";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { withErrorHandling } from "@/server/lib/http";

const settingsSchema = z.object({ frequency: z.enum(["WEEKLY", "MONTHLY"]) });

// PATCH /api/landlord/payouts/settings — Body: { frequency: "WEEKLY" | "MONTHLY" }.
// How often the active organization is paid: every Monday or on the 1st of
// the month (Europe/Paris). Organization owners only: it decides when the
// money reaches the organization.
export const PATCH = withErrorHandling(async (request: Request) => {
  const ctx = await requireOrgCapability("landlord:manage_organization");
  const { frequency } = settingsSchema.parse(await request.json().catch(() => null));
  await prisma.organization.update({ where: { id: ctx.organizationId }, data: { payoutFrequency: frequency } });
  await recordAudit({
    event: "organization.payout_frequency_changed",
    actorUserId: ctx.userId,
    organizationId: ctx.organizationId,
    metadata: { frequency },
  });
  return NextResponse.json({ frequency });
});
