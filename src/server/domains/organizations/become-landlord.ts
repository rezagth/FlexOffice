import type { BecomeLandlordInput } from "@/lib/validation/landlord";
import { prisma } from "@/server/db/prisma";
import type { AuthContext } from "@/server/auth/rbac";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, ValidationError } from "@/server/lib/errors";
import { createDraftVerification } from "@/server/domains/verification/create";

/**
 * "Devenir bailleur" — opens a letting activity on an existing account.
 *
 * WHAT IT ACTUALLY DOES, IN ONE TRANSACTION
 *   1. creates the Organization that will hold the activity;
 *   2. adds the caller to it as OWNER, ACTIVE;
 *   3. unlocks `isLandlord` and preselects the new organization;
 *   4. creates the DRAFT verification dossier for it (Phase 3).
 *
 * All four or none. Step 2 is the one Phase 2 already documented here: every
 * landlord authorization reads `organization_members`, so an organization
 * created without a membership would look right and grant nothing. Step 4 is
 * the same failure mode one level up — an organization with no dossier would
 * never appear in an admin's review queue and could never become VERIFIED,
 * while `isLandlord` already looks fully set up.
 *
 * WHAT IT DOES NOT DO
 * No document upload here — a dossier needs its own id to attach documents
 * to, which this call is what creates. `activityType` (OWNER vs OPERATOR,
 * see `src/lib/validation/landlord.ts`) is collected as part of THIS payload
 * because it decides which documents that dossier will require
 * (`domains/verification/requirements.ts`), and the dossier is created here.
 * The organization is created `PENDING_VERIFICATION` (the column default);
 * `publication-guard.ts` now requires VERIFIED, which only
 * `domains/verification/review.ts` can grant.
 *
 * The mode is NOT switched here. Unlocking the capability and choosing to use
 * it are separate acts; the caller switches afterwards, through
 * `switchMode()`, which is the same path any later switch takes.
 */
export async function becomeLandlord({
  actor,
  input,
}: {
  actor: AuthContext;
  input: BecomeLandlordInput;
}) {
  // One landlord activity per account in Phase 2. Joining an existing
  // organization is an invitation flow (a member has to invite you), and
  // running a second organization is the professional case — both belong with
  // the agency work, not here. Refusing plainly beats silently creating a
  // second organization the UI cannot yet show.
  const existing = await prisma.organizationMember.findFirst({
    where: { profileId: actor.userId, status: "ACTIVE" },
    select: { organizationId: true },
  });
  if (existing) {
    throw new ConflictError(
      "Ce compte exerce déjà une activité de bailleur."
    );
  }

  // Consistency, not trust: SIREN is the first 9 digits of the SIRET, so a
  // mismatch means the caller sent two contradictory identifiers and we must
  // not pick one.
  if (input.holderType === "COMPANY" && input.siren) {
    if (input.siret.slice(0, 9) !== input.siren) {
      throw new ValidationError(
        "Le SIREN ne correspond pas aux 9 premiers chiffres du SIRET."
      );
    }
  }

  const contactEmail = input.contactEmail ?? actor.email;

  const data =
    input.holderType === "COMPANY"
      ? {
          holderType: "COMPANY" as const,
          name: input.displayName ?? input.legalName,
          legalName: input.legalName,
          siret: input.siret,
          siren: input.siren ?? input.siret.slice(0, 9),
          vatNumber: input.vatNumber ?? null,
          legalRepresentativeName: input.legalRepresentativeName,
        }
      : {
          holderType: "INDIVIDUAL" as const,
          // An individual's identity already lives on the Profile; the
          // organization only needs a name to show a client.
          name: input.displayName ?? actor.name,
          legalName: null,
          // Enforced by organizations_holder_type_siret_check: an individual
          // holder must have no SIRET.
          siret: null,
          siren: null,
          vatNumber: null,
          legalRepresentativeName: null,
        };

  const organization = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        ...data,
        email: contactEmail,
        address: input.address,
        city: input.city,
        postalCode: input.postalCode,
        // Explicit rather than relying on the default: this is the fact
        // the verification dossier below acts on.
        status: "PENDING_VERIFICATION",
        memberships: {
          create: {
            profileId: actor.userId,
            orgRole: "OWNER",
            status: "ACTIVE",
          },
        },
      },
      select: { id: true, name: true, holderType: true, status: true },
    });

    await tx.profile.update({
      where: { id: actor.userId },
      data: {
        isLandlord: true,
        activeOrganizationId: created.id,
        // activeMode deliberately untouched — see the note above.
      },
    });

    const verification = await createDraftVerification(tx, {
      organizationId: created.id,
      requestedByProfileId: actor.userId,
      activityType: input.activityType,
    });

    return { ...created, verificationId: verification.id };
  });

  await recordAudit({
    event: "landlord.activity_opened",
    actorUserId: actor.userId,
    organizationId: organization.id,
    metadata: { holder_type: organization.holderType, verification_id: organization.verificationId },
  });

  return organization;
}
