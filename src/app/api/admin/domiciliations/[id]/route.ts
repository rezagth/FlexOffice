import { NextResponse } from "next/server";
import { domiciliationStatusChangeSchema } from "@/lib/validation/domiciliation";
import { requireAdmin } from "@/server/auth/rbac";
import { changeDomiciliationRequestStatus } from "@/server/domains/organizations/domiciliation";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/domiciliations/[id] — Body: { status, notes? }.
// Auth: platform administration. Applies to either kind (MAKOMSPACE or
// THIRD_PARTY) — see domiciliation.ts's own doc comment.
export const PATCH = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const { status, notes } = domiciliationStatusChangeSchema.parse(await request.json().catch(() => null));
  const updated = await changeDomiciliationRequestStatus(ctx.userId, id, status, notes);
  return NextResponse.json(updated);
});
