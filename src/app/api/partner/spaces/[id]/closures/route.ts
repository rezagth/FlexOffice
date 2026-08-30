import { NextResponse } from "next/server";
import { requireOrg } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { closureSchema } from "@/lib/validation/spaces";
import { createClosure, listClosures } from "@/server/domains/organizations/closures";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireOrg();
  const { id } = await params;
  const closures = await listClosures(ctx.organizationId, id);
  return NextResponse.json({ closures });
});

export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireOrg();
  const { id } = await params;
  const input = closureSchema.parse(await request.json());
  const closure = await createClosure(ctx.organizationId, id, input);
  return NextResponse.json({ closure }, { status: 201 });
});
