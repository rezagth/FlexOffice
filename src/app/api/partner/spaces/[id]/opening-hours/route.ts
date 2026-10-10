import { NextResponse } from "next/server";
import { requireOrg } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { requireOrgCapability } from "@/server/domains/organizations/require-org-capability";
import { openingHoursWeekSchema } from "@/lib/validation/spaces";
import { listOpeningHours, replaceOpeningHours } from "@/server/domains/organizations/opening-hours";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireOrg();
  const { id } = await params;
  const hours = await listOpeningHours(ctx.organizationId, id);
  return NextResponse.json({ hours });
});

// PUT — replaces the whole week at once (see replaceOpeningHours).
export const PUT = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireOrgCapability("landlord:manage_calendar");
  const { id } = await params;
  const hours = openingHoursWeekSchema.parse(await request.json());
  await replaceOpeningHours(ctx.organizationId, id, hours);
  return NextResponse.json({ hours });
});
