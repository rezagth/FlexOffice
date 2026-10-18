import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/rbac";
import { markNotificationRead } from "@/server/domains/notifications/in-app";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/notifications/[id]/read — marks one of the caller's own
// notifications read. Scoped by ctx.userId AND the id together
// (markNotificationRead) — an id that isn't the caller's own notification
// matches nothing and is a harmless no-op, never an action on someone
// else's notification.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAuth();
  const { id } = await params;
  await markNotificationRead(ctx.userId, id);
  return NextResponse.json({ ok: true });
});
