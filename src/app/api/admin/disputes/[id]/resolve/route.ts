import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import { resolveDisputeSchema } from "@/lib/validation/disputes";
import { resolveDispute } from "@/server/domains/disputes/review";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const input = resolveDisputeSchema.parse(await request.json());

  const result = await resolveDispute({
    disputeId: id,
    actorUserId: ctx.userId,
    outcome: input.outcome,
    notes: input.notes,
    refundAmountCents: input.refundAmountCents,
  });

  return NextResponse.json(result);
});
