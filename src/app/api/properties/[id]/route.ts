import { NextResponse } from "next/server";
import { updatePropertySchema } from "@/lib/validation/properties";
import { requirePropertyManageAccess } from "@/server/domains/properties/access";
import { getPropertyDetail } from "@/server/domains/properties/get";
import { updateProperty } from "@/server/domains/properties/update";
import { withErrorHandling } from "@/server/lib/http";
import { NotFoundError } from "@/server/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/properties/[id] — full detail, only for a caller whose active
//   organization holds a role on this property (owner, operator, manager)
//   or is a platform admin.
// PATCH /api/properties/[id] — edits it. Same access check.
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  await requirePropertyManageAccess(id);
  const property = await getPropertyDetail(id);
  if (!property) throw new NotFoundError("Property not found");
  return NextResponse.json({ property });
});

export const PATCH = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const { id } = await params;
  const { ctx } = await requirePropertyManageAccess(id);
  const input = updatePropertySchema.parse(await request.json());
  const property = await updateProperty(id, ctx, input);
  return NextResponse.json({ property });
});
