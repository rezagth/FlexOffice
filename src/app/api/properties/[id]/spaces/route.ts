import { NextResponse } from "next/server";
import { createSpaceSchema } from "@/lib/validation/spaces";
import { requirePropertyManageAccess } from "@/server/domains/properties/access";
import { createSpace } from "@/server/domains/organizations/create-space";
import { prisma } from "@/server/db/prisma";
import { withErrorHandling } from "@/server/lib/http";
import { ForbiddenError } from "@/server/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = createSpaceSchema.omit({ propertyId: true });

// GET /api/properties/[id]/spaces — every Space under this property, for a
//   caller related to it.
// POST /api/properties/[id]/spaces — creates one, under the caller's
//   ACTIVE organization (never a body-supplied one — see create-space.ts).
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  await requirePropertyManageAccess(id);
  const spaces = await prisma.space.findMany({
    where: { propertyId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ spaces });
});

export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const { id } = await params;
  const { ctx } = await requirePropertyManageAccess(id);
  if (!ctx.activeOrgId) {
    throw new ForbiddenError("This account is not linked to an organization");
  }

  const input = bodySchema.parse(await request.json());
  const space = await createSpace(ctx.activeOrgId, { ...input, propertyId: id });
  return NextResponse.json({ space }, { status: 201 });
});
