import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/rbac";
import { markAllNotificationsRead } from "@/server/domains/notifications/in-app";
import { withErrorHandling } from "@/server/lib/http";

// POST /api/notifications/read-all — marks every one of the caller's own
// unread notifications read.
export const POST = withErrorHandling(async () => {
  const ctx = await requireAuth();
  await markAllNotificationsRead(ctx.userId);
  return NextResponse.json({ ok: true });
});
