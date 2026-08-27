import { prisma } from "@/server/db/prisma";

/**
 * Public space search — deliberately simple for this iteration (city
 * substring match only). No auth required: browsing published listings is
 * public, same as the rest of the marketplace's "Découvrir" experience.
 * Date/capacity/amenities filters are noted as future work, not silently
 * ignored — the search page below says so.
 */
export async function listPublishedSpaces(params: { city?: string } = {}) {
  return prisma.space.findMany({
    where: {
      status: "PUBLISHED",
      ...(params.city
        ? { city: { contains: params.city, mode: "insensitive" } }
        : {}),
    },
    include: { organization: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getPublishedSpaceBySlug(slug: string) {
  return prisma.space.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: {
      organization: { select: { name: true } },
      openingHours: true,
    },
  });
}
