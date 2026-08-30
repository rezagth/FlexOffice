import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
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
 * never publicly visible until an admin publishes it (moderate-space.ts). */
export async function createSpace(organizationId: string, input: CreateSpaceInput) {
  const slug = await uniqueSlug(slugify(input.name));
  const space = await prisma.space.create({
    data: {
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
