import { NextResponse } from "next/server";
import { z } from "zod";
import { landlordActivityTypeSchema } from "@/lib/validation/landlord";
import { requireCapability } from "@/server/auth/rbac";
import { getOrCreateDraftVerification } from "@/server/domains/verification/create";
import { withErrorHandling } from "@/server/lib/http";
import { ForbiddenError } from "@/server/lib/errors";

const bodySchema = z.object({ activityType: landlordActivityTypeSchema });

// POST /api/verifications
// Auth: required, caller must hold landlord:manage_verification for the
//   organization they belong to (OWNER or org ADMIN — see capabilities.ts).
// Body: { activityType: "OWNER" | "OPERATOR" }
//
// Idempotent by design: the normal journey already creates a DRAFT dossier
// atomically inside becomeLandlord() (see
// domains/organizations/become-landlord.ts), so this exists for the cases
// that path does not cover — a dossier that reached EXPIRED and needs a
// fresh one, or a defensive fallback if a pre-Phase-3 organization somehow
// has none. Calling it when a live dossier already exists returns that one
// unchanged (200); `activityType` in the body is only used if a new dossier
// is actually created.
export const POST = withErrorHandling(async (request: Request) => {
  const ctx = await requireCapability("landlord:manage_verification");
  if (!ctx.activeOrgId) {
    // Unreachable in practice — the capability above is only granted
    // alongside a resolved membership — kept so a future capability change
    // cannot silently produce an unscoped write.
    throw new ForbiddenError("Aucune organisation active pour ce compte.");
  }

  const body = await request.json().catch(() => null);
  const { activityType } = bodySchema.parse(body);

  const { verification, created } = await getOrCreateDraftVerification({
    organizationId: ctx.activeOrgId,
    requestedByProfileId: ctx.userId,
    activityType,
  });

  return NextResponse.json(
    {
      id: verification.id,
      status: verification.status,
      activityType: verification.activityType,
    },
    { status: created ? 201 : 200 }
  );
});
