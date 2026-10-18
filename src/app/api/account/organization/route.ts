import { NextResponse } from "next/server";
import { updateOrganizationIdentitySchema } from "@/lib/validation/landlord";
import { requireAuth } from "@/server/auth/rbac";
import { findActiveMembership } from "@/server/auth/active-context";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { ACCOUNT_RATE_LIMITS } from "@/server/domains/users/auth-limits";
import { updateOrganizationIdentity } from "@/server/domains/organizations/update-organization-identity";
import { ForbiddenError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

const ORG_ROLES_ALLOWED_TO_EDIT_IDENTITY = new Set(["OWNER", "ADMIN"]);

// PATCH /api/account/organization
// Auth: requireAuth, then the caller must hold an ACTIVE membership of
// `organizationId` with orgRole OWNER or ADMIN — the id in the body is only
// ever a target, never a grant (never trust it alone).
// Body: { organizationId, legalName, siret } — PRD V1.1 R81.
export const PATCH = withErrorHandling(async (request: Request) => {
  const ctx = await requireAuth();
  const input = updateOrganizationIdentitySchema.parse(await request.json().catch(() => null));

  await enforceRateLimit({
    key: `account:organization:user:${ctx.userId}`,
    config: ACCOUNT_RATE_LIMITS.profileUpdate,
    endpoint: "PATCH /api/account/organization",
    scope: "user",
  });

  const membership = await findActiveMembership(ctx.userId, input.organizationId);
  if (!membership || !ORG_ROLES_ALLOWED_TO_EDIT_IDENTITY.has(membership.orgRole)) {
    throw new ForbiddenError(
      "Vous n'avez pas les droits pour modifier les informations de cette organisation."
    );
  }

  const { organization, reverification } = await updateOrganizationIdentity(
    input.organizationId,
    { siret: input.siret, legalName: input.legalName },
    ctx.userId
  );
  return NextResponse.json({ organization, reverification });
});
