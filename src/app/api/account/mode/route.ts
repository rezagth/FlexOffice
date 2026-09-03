import { NextResponse } from "next/server";
import { switchModeSchema } from "@/lib/validation/landlord";
import { requireAuth } from "@/server/auth/rbac";
import { switchMode } from "@/server/domains/users/switch-mode";
import { withErrorHandling } from "@/server/lib/http";

// PUT /api/account/mode
// Auth: required.
// Body: { mode: "TENANT" | "LANDLORD", organizationId?: uuid }
//
// The payload states an intention, never a grant. `mode` is checked against
// the account's capability and `organizationId` against an ACTIVE membership
// — see switchMode(). Sending another organization's id gets a 403, not that
// organization.
//
// Not rate-limited: it is a cheap, idempotent write on the caller's own row,
// available only to an authenticated session, and throttling it would make
// the UI toggle feel broken. The expensive, organization-creating action
// (become-landlord) is limited instead.
export const PUT = withErrorHandling(async (request: Request) => {
  const ctx = await requireAuth();

  const body = await request.json().catch(() => null);
  const input = switchModeSchema.parse(body);

  const result = await switchMode({ actor: ctx, input });

  return NextResponse.json(result);
});
