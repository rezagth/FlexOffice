import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import { listTickets } from "@/server/domains/support/tickets";
import { withErrorHandling } from "@/server/lib/http";

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  const tickets = await listTickets();
  return NextResponse.json({ tickets });
});
