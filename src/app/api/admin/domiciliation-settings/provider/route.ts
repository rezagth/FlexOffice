import { NextResponse } from "next/server";
import { domiciliationProviderSchema } from "@/lib/validation/domiciliation";
import { requireAdmin } from "@/server/auth/rbac";
import { updateDomiciliationProvider } from "@/server/domains/organizations/domiciliation";
import { withErrorHandling } from "@/server/lib/http";

// PATCH /api/admin/domiciliation-settings/provider — Body: { name, agrementNumber }.
// The licensed domiciliataire behind the MakomSpace offer. Auth: platform
// administration.
export const PATCH = withErrorHandling(async (request: Request) => {
  const ctx = await requireAdmin();
  const provider = domiciliationProviderSchema.parse(await request.json().catch(() => null));
  await updateDomiciliationProvider(ctx.userId, provider);
  return NextResponse.json(provider);
});
