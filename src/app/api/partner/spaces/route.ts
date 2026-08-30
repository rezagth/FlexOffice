import { NextResponse } from "next/server";
import { requireOrg } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { createSpaceSchema } from "@/lib/validation/spaces";
import { createSpace } from "@/server/domains/organizations/create-space";
import { listOrgSpaces } from "@/server/domains/spaces/list-org-spaces";

// GET /api/partner/spaces — the calling organization's own spaces.
export const GET = withErrorHandling(async () => {
  const ctx = await requireOrg();
  const spaces = await listOrgSpaces(ctx.organizationId);
  return NextResponse.json({ spaces });
});

// POST /api/partner/spaces — creates a DRAFT space. Not publicly visible
// until submitted and approved by an admin.
export const POST = withErrorHandling(async (request: Request) => {
  const ctx = await requireOrg();
  const input = createSpaceSchema.parse(await request.json());
  const space = await createSpace(ctx.organizationId, input);
  return NextResponse.json({ space }, { status: 201 });
});
