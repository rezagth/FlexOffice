import { prisma } from "@/server/db/prisma";
import { requireAuth, requireCapability, type AuthContext } from "@/server/auth/rbac";
import { ForbiddenError, NotFoundError } from "@/server/lib/errors";
import { logEvent } from "@/server/lib/logger";
import type { Property, PropertyManager, PropertyOperator, PropertyOwner } from "@/generated/prisma/client";

/**
 * Same shape as `requireOrg()` (src/server/auth/rbac.ts), scoped to the
 * property capability. `landlord:manage_properties` is only ever granted
 * alongside a resolved ACTIVE membership (see capabilities.ts), so
 * `activeOrgId` is always set here in practice — checked anyway so a future
 * change to the capability table cannot silently produce an unscoped query.
 */
export async function requirePropertyOrg(): Promise<
  AuthContext & { organizationId: string; activeOrgId: string }
> {
  const ctx = await requireCapability("landlord:manage_properties");
  if (!ctx.activeOrgId) {
    logEvent({ event: "authz.denied", user_id: ctx.userId, reason: "no_organization" });
    throw new ForbiddenError("This account is not linked to an organization");
  }
  return ctx as AuthContext & { organizationId: string; activeOrgId: string };
}

type PropertyWithRelations = Property & {
  owners: PropertyOwner[];
  operators: PropertyOperator[];
  managers: PropertyManager[];
};

/** An "active" relation is a simple flag, not a date range in effect yet —
 * `endsAt IS NULL` — the same model `OrganizationMember.status` uses. */
function isActive(row: { endsAt: Date | null }): boolean {
  return row.endsAt === null;
}

/** Pure predicate behind `requirePropertyManageAccess` — exported so a page
 * that has already loaded the property (e.g. from `getPropertyDetail()`)
 * can answer the same question without a second query, or without the
 * throwing control flow a Server Component would rather avoid. */
export function organizationManagesProperty(
  property: PropertyWithRelations,
  organizationId: string | null
): boolean {
  if (organizationId === null) return false;
  return (
    property.owners.some((o) => o.organizationId === organizationId && isActive(o)) ||
    property.operators.some((o) => o.organizationId === organizationId && isActive(o)) ||
    property.managers.some((m) => m.organizationId === organizationId && isActive(m))
  );
}

/**
 * Loads a property and asserts the caller's ACTIVE organization currently
 * holds a management role on it — owner, operator, or manager. This phase
 * does not yet distinguish what each role may edit beyond that (see
 * `PropertyManager`'s doc comment: `scope` is reserved, not read).
 *
 * Platform admins bypass, same as `requireOrganizationAccess()`. A property
 * the caller has no relation to answers 404, not 403 — a 403 would confirm
 * the id exists to someone who has no business knowing that.
 */
export async function requirePropertyManageAccess(
  propertyId: string
): Promise<{ ctx: AuthContext; property: PropertyWithRelations }> {
  const ctx = await requireAuth();

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: { owners: true, operators: true, managers: true },
  });
  if (!property) throw new NotFoundError("Property not found");

  if (ctx.platformRole === "ADMIN") return { ctx, property };

  if (!organizationManagesProperty(property, ctx.activeOrgId)) {
    logEvent({
      event: "authz.denied",
      user_id: ctx.userId,
      reason: "not_related_to_property",
      property_id: propertyId,
    });
    throw new NotFoundError("Property not found");
  }

  return { ctx, property };
}

/** Whether `organizationId` is a CURRENT owner or operator of `propertyId`
 * — the invariant `spaces.organization_id` must satisfy at all times (see
 * the doc comment on `Space.organizationId` in prisma/schema.prisma).
 * Manager alone does not qualify: a manager runs the property, it does not
 * become the entity a Space is let under. */
export async function isCurrentOwnerOrOperator(
  propertyId: string,
  organizationId: string
): Promise<boolean> {
  const [owner, operator] = await Promise.all([
    prisma.propertyOwner.findFirst({
      where: { propertyId, organizationId, endsAt: null },
      select: { id: true },
    }),
    prisma.propertyOperator.findFirst({
      where: { propertyId, organizationId, endsAt: null },
      select: { id: true },
    }),
  ]);
  return owner !== null || operator !== null;
}
