import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { requireOrg } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { NotFoundError, ValidationError } from "@/server/lib/errors";
import { summarizeMonth } from "@/server/domains/bookings/availability";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/partner/spaces/[id]/availability?month=YYYY-MM
// One status per calendar day, for the partner calendar view.
export const GET = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireOrg();
  const { id } = await params;

  const space = await prisma.space.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!space) throw new NotFoundError("Space not found");

  const month = new URL(request.url).searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new ValidationError("Paramètre month attendu au format YYYY-MM");
  }

  const days = await summarizeMonth(id, month);
  return NextResponse.json({ month, days });
});
