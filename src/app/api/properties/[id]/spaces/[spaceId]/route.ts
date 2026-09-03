import { NextResponse } from "next/server";
import { updateSpaceSchema } from "@/lib/validation/spaces";
import { requirePropertyManageAccess } from "@/server/domains/properties/access";
import { getSpaceForProperty, updateSpaceViaProperty } from "@/server/domains/properties/spaces";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string; spaceId: string }> };

// GET/PATCH /api/properties/[id]/spaces/[spaceId] — property-derived
//   authorization (Étape 29), unlike the older /api/partner/spaces/[id]
//   which still reads organizationId. Both reach the same row; see
//   Space.organizationId's doc comment in prisma/schema.prisma.
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const { id: propertyId, spaceId } = await params;
  await requirePropertyManageAccess(propertyId);
  const space = await getSpaceForProperty(propertyId, spaceId);
  return NextResponse.json({ space });
});

export const PATCH = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const { id: propertyId, spaceId } = await params;
  const { ctx } = await requirePropertyManageAccess(propertyId);
  // Confirms spaceId actually belongs to propertyId before writing.
  await getSpaceForProperty(propertyId, spaceId);
  const input = updateSpaceSchema.parse(await request.json());
  const space = await updateSpaceViaProperty(spaceId, ctx, input);
  return NextResponse.json({ space });
});
