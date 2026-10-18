import { NextResponse } from "next/server";
import { domiciliationOfferSettingSchema } from "@/lib/validation/domiciliation";
import { requireAdmin } from "@/server/auth/rbac";
import { setDomiciliationOfferEnabled } from "@/server/domains/organizations/domiciliation";
import { withErrorHandling } from "@/server/lib/http";

// PATCH /api/admin/domiciliation-settings — Body: { offerEnabled: boolean }.
// Auth: platform administration. S11 — flipping this on is a legal decision
// this codebase cannot verify; the admin screen carries the warning, this
// route just records who did it and when (recordAudit, in
// setDomiciliationOfferEnabled).
export const PATCH = withErrorHandling(async (request: Request) => {
  const ctx = await requireAdmin();
  const { offerEnabled } = domiciliationOfferSettingSchema.parse(await request.json().catch(() => null));
  await setDomiciliationOfferEnabled(ctx.userId, offerEnabled);
  return NextResponse.json({ offerEnabled });
});
