import type { BecomeLandlordInput } from "@/lib/validation/landlord";
import { prisma } from "@/server/db/prisma";
import type { AuthContext } from "@/server/auth/rbac";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, ValidationError } from "@/server/lib/errors";

/**
 * "Devenir bailleur" — opens a letting activity on an existing account.
 *
 * WHAT IT ACTUALLY DOES, IN ONE TRANSACTION
 *   1. creates the Organization that will hold the activity;
 *   2. adds the caller to it as OWNER, ACTIVE;
 *   3. unlocks `isLandlord` and preselects the new organization.
 *
 * All three or none. Step 2 is the one that matters: every landlord
 * authorization reads `organization_members`, so an organization created
 * without a membership would look right and grant nothing. Creating them in
 * separate statements outside a transaction is exactly how that state
 * appears.
 *
 * WHAT IT DOES NOT DO
 * No document upload, no identity check, no proof of ownership, no Kbis
 * lookup. The organization is created `PENDING_VERIFICATION` (the column
 * default), and publication is already gated on the organization's status by
 * `publication-guard.ts` — so Phase 3 tightens that threshold rather than
 * having to retrofit a check.
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
        // Phase 3's verification will act on.
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

    return created;
  });

  await recordAudit({
    event: "landlord.activity_opened",
    actorUserId: actor.userId,
    organizationId: organization.id,
    metadata: { holder_type: organization.holderType },
  });

  return organization;
}
