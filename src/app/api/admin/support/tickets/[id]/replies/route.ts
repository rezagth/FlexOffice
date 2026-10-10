import { NextResponse } from "next/server";
import { z } from "zod";
import { supportReplySchema } from "@/lib/validation/admin";
import { requireAdmin } from "@/server/auth/rbac";
import { listTicketReplies, replyToTicket } from "@/server/domains/support/tickets";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/support/tickets/[id]/replies — the reply history.
// POST — Body: { body: string, close?: boolean }. Stored, then e-mailed to
//   the ticket's address; `emailed: false` when the provider refused it.
// Auth: platform administration.
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const replies = await listTicketReplies(z.uuid().parse(id));
  return NextResponse.json({ replies });
});

export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const input = supportReplySchema.parse(await request.json().catch(() => null));
  const result = await replyToTicket({
    ticketId: z.uuid().parse(id),
    actorUserId: ctx.userId,
    body: input.body,
    close: input.close,
  });
  return NextResponse.json(result, { status: 201 });
});
