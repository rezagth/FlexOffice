import { NextResponse } from "next/server";
import { requireOrg } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { updateSpaceSchema } from "@/lib/validation/spaces";
import { updateSpace } from "@/server/domains/organizations/update-space";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/partner/spaces/[id] — edits a space the caller's organization
// owns. A space belonging to another organization returns 404, not 403.
export const PATCH = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireOrg();
  const { id } = await params;
  const input = updateSpaceSchema.parse(await request.json());
  const space = await updateSpace(ctx.organizationId, id, input);
  return NextResponse.json({ space });
});
