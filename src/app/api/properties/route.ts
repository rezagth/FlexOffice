import { NextResponse } from "next/server";
import { createPropertySchema } from "@/lib/validation/properties";
import { requirePropertyOrg } from "@/server/domains/properties/access";
import { createProperty } from "@/server/domains/properties/create";
import { listPropertiesForOrg } from "@/server/domains/properties/get";
import { withErrorHandling } from "@/server/lib/http";

// GET /api/properties — the caller's own portfolio (owned, operated, or
//   managed by their active organization).
// POST /api/properties — creates a Property, with the active organization
//   as its OWNER and OPERATOR. Never trusts an organization id from the
//   body: it always comes from the verified session.
export const GET = withErrorHandling(async () => {
  const ctx = await requirePropertyOrg();
  const properties = await listPropertiesForOrg(ctx.organizationId);
  return NextResponse.json({ properties });
});

export const POST = withErrorHandling(async (request: Request) => {
  const ctx = await requirePropertyOrg();
  const input = createPropertySchema.parse(await request.json());
  const property = await createProperty(ctx.organizationId, ctx.userId, input);
  return NextResponse.json({ property }, { status: 201 });
});
