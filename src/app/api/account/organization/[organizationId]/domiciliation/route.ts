import { NextResponse } from "next/server";
import { domiciliationRequestSchema } from "@/lib/validation/domiciliation";
import { requireDomiciliationOrgAccess } from "@/server/domains/organizations/domiciliation-access";
import { createDomiciliationRequest } from "@/server/domains/organizations/domiciliation";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ organizationId: string }> };

// POST /api/account/organization/[organizationId]/domiciliation
// Auth: OWNER/ADMIN of the organization (requireDomiciliationOrgAccess).
// Body: DomiciliationRequestInput — PRD V1.1 2B, R53-R58. Optional section
// from "Mon compte": creates a new current request (the previous one, if
// any, stays in the audit trail — see domiciliation.ts).
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const { organizationId } = await params;
  const ctx = await requireDomiciliationOrgAccess(organizationId);

  const input = domiciliationRequestSchema.parse(await request.json().catch(() => null));
  const created = await createDomiciliationRequest({
    organizationId,
    actorUserId: ctx.userId,
    kind: input.domiciliationKind,
    domiciliataireName: input.domiciliataireName,
    domiciliationAddress: input.domiciliationAddress,
    domiciliationCity: input.domiciliationCity,
    domiciliationPostalCode: input.domiciliationPostalCode,
  });
  return NextResponse.json(created, { status: 201 });
});
