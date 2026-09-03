import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { ConflictError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import type { AuthContext } from "@/server/auth/rbac";

export type OperatorHolder = { profileId: string } | { organizationId: string };

function holderData(holder: OperatorHolder) {
  return "profileId" in holder
    ? { profileId: holder.profileId, organizationId: null }
    : { profileId: null, organizationId: holder.organizationId };
}

// At most one CURRENT operator per property is a partial UNIQUE index
// (`property_operators_one_current_idx`, migration 20260905110000), not a
// schema-declared `@@unique` — Prisma has no syntax for a partial index, but
// still recognizes the violation as an ordinary unique-constraint conflict
// (P2002) despite the index being absent from its own schema metadata;
// confirmed by reproducing the conflict against a local database (see
// officeflex-security-guardrails §6) rather than guessing the shape.
const ONE_CURRENT_OPERATOR_INDEX = "property_operators_one_current_idx";

function isCurrentOperatorConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    typeof error.message === "string" &&
    error.message.includes(ONE_CURRENT_OPERATOR_INDEX)
  );
}

/**
 * Adds an operator. A property has at most one CURRENT operator — the
 * entity later payout logic will pay — so replacing one means ending the
 * old row first, not adding a second concurrent one; this function only
 * adds, it does not end the previous operator implicitly, so that swap is
 * always an explicit two-step call, visible in the audit log as two events
 * rather than one that silently displaced someone.
 */
export async function addPropertyOperator(
  propertyId: string,
  ctx: AuthContext,
  holder: OperatorHolder,
  mandateReference?: string
) {
  let operator;
  try {
    operator = await prisma.propertyOperator.create({
      data: { propertyId, mandateReference, ...holderData(holder) },
    });
  } catch (error) {
    if (isCurrentOperatorConflict(error)) {
      throw new ConflictError("Ce bien a déjà un exploitant actuel — mettez fin au mandat existant d'abord");
    }
    throw error;
  }

  await recordAudit({
    event: "property.operator_added",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { propertyId, operatorId: operator.id, ...holderData(holder) },
  });
  return operator;
}

/** Ends an operator's mandate — soft: sets `endsAt`, never deletes the
 * historical row. */
export async function endPropertyOperator(propertyId: string, operatorId: string, ctx: AuthContext) {
  const result = await prisma.propertyOperator.updateMany({
    where: { id: operatorId, propertyId, endsAt: null },
    data: { endsAt: new Date() },
  });
  if (result.count === 0) {
    throw new ConflictError("Cet exploitant n'est plus actif sur ce bien");
  }

  await recordAudit({
    event: "property.operator_removed",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { propertyId, operatorId },
  });
}
