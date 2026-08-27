import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { requireRole } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";

// GET /api/admin/organizations — Auth: required, role ADMIN only.
// Verification actions (approve/suspend/contact) are scaffolded for a
// following iteration; this lists organizations for review today.
export const GET = withErrorHandling(async () => {
  await requireRole("ADMIN");
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ organizations });
});
