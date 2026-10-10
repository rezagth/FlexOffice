import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { requireAdmin } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";

// GET /api/admin/organizations — Auth: platform administration.
// Suspension / reactivation: ./[id]/suspend and ./[id]/reactivate;
// verification decisions live under /api/admin/verifications.
export const GET = withErrorHandling(async () => {
  await requireAdmin();
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ organizations });
});
