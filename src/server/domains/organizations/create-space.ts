import { prisma } from "@/server/db/prisma";
import { NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { isCurrentOwnerOrOperator } from "@/server/domains/properties/access";
import type { CreateSpaceInput } from "@/lib/validation/spaces";

const COMBINING_DIACRITICS = /[\u0300-\u036f]/g;

function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(COMBINING_DIACRITICS, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "espace"
  );
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let suffix = 0;
  for (;;) {
    const existing = await prisma.space.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

/** Creates a new DRAFT space for the calling partner's organization —
 * never publicly visible until an admin publishes it (moderate-space.ts).
 *
 * `input.propertyId` must name a property this organization currently
 * owns or operates — checked here, not by a CHECK constraint, since that
 * is a cross-table read (see the doc comment on `Space.organizationId` in
 * prisma/schema.prisma). This is what keeps `organizationId` (kept live
 * this phase) from ever pointing at an organization unrelated to the
 * space's own property. */
export async function createSpace(organizationId: string, input: CreateSpaceInput) {
  // Same property, whether it does not exist or exists but belongs to
  // someone else — a distinct error there would confirm the id to a caller
  // who has no business knowing that (see the ownership rules in the
  // security guardrails: 404, never 403, for another tenant's row).
  if (!(await isCurrentOwnerOrOperator(input.propertyId, organizationId))) {
    throw new NotFoundError("Property not found");
  }

  const slug = await uniqueSlug(slugify(input.name));
  const space = await prisma.space.create({
    data: {
      propertyId: input.propertyId,
      organizationId,
      slug,
      name: input.name,
      type: input.type,
      description: input.description,
      address: input.address,
      city: input.city,
      postalCode: input.postalCode,
      capacity: input.capacity,
      amenities: input.amenities,
      photos: input.photos ?? [],
      halfDayPriceCents: input.halfDayPriceCents,
      dayPriceCents: input.dayPriceCents,
      accessInstructions: input.accessInstructions,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      status: "DRAFT",
    },
  });
  await recordAudit({ event: "space.created", organizationId, metadata: { spaceId: space.id } });
  return space;
}
