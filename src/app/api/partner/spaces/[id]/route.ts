import { NextResponse } from "next/server";
import { withErrorHandling } from "@/server/lib/http";
import { requireOrgCapability } from "@/server/domains/organizations/require-org-capability";
import { updateSpaceSchema } from "@/lib/validation/spaces";
import { updateSpace } from "@/server/domains/organizations/update-space";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/partner/spaces/[id] — edits a space the caller's organization
// owns. A space belonging to another organization returns 404, not 403.
export const PATCH = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireOrgCapability("landlord:manage_spaces");
  const { id } = await params;
  const input = updateSpaceSchema.parse(await request.json());
  const space = await updateSpace(ctx.organizationId, id, input, ctx.userId);
  return NextResponse.json({ space });
});
