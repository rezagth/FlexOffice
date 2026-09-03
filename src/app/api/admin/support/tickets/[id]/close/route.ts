import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import { closeTicket } from "@/server/domains/support/tickets";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const ticket = await closeTicket(id, ctx.userId);
  return NextResponse.json({ id: ticket.id, status: ticket.status });
});
