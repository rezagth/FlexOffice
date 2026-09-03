import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/rbac";
import { sendMessageSchema } from "@/lib/validation/messages";
import { listMessages, sendMessage } from "@/server/domains/messaging/conversation";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/bookings/[id]/messages — the thread for this booking. Either
//   side of it (client or landlord org) may read; a booking outside both
//   is 404 (see conversation.ts).
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAuth();
  const { id } = await params;
  const messages = await listMessages({
    bookingId: id,
    userId: ctx.userId,
    activeOrgId: ctx.activeOrgId ?? null,
  });
  return NextResponse.json({ messages });
});

// POST /api/bookings/[id]/messages — sends a message, creating the
//   conversation on first use.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAuth();
  const { id } = await params;
  const input = sendMessageSchema.parse(await request.json());

  const message = await sendMessage({
    bookingId: id,
    userId: ctx.userId,
    activeOrgId: ctx.activeOrgId ?? null,
    body: input.body,
  });

  return NextResponse.json({ message }, { status: 201 });
});
