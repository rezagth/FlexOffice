import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import {
  listVerificationsForAdmin,
  type VerificationListFilter,
} from "@/server/domains/verification/get";
import { withErrorHandling } from "@/server/lib/http";

const VALID_FILTERS: readonly VerificationListFilter[] = [
  "PENDING",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "ALL",
];

// GET /api/admin/verifications?status=PENDING|IN_REVIEW|APPROVED|REJECTED|ALL
// Auth: required, platform administration only.
export const GET = withErrorHandling(async (request: Request) => {
  await requireAdmin();

  const requested = new URL(request.url).searchParams.get("status");
  const filter: VerificationListFilter = VALID_FILTERS.includes(
    requested as VerificationListFilter
  )
    ? (requested as VerificationListFilter)
    : "PENDING";

  const verifications = await listVerificationsForAdmin(filter);
  return NextResponse.json({ verifications });
});
