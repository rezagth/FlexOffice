import { prisma } from "@/server/db/prisma";
import { MOCK_SPACES } from "./mock-data";

// No DATABASE_URL configured yet (e.g. a demo deploy without Supabase
// wired up): fall back to static demo data instead of erroring, so the
// public pages stay browsable. Once DATABASE_URL is set this branch never
// runs — see mock-data.ts.
const useMockData = !process.env.DATABASE_URL;

/**
 * Public space search — deliberately simple for this iteration (city
 * substring match only). No auth required: browsing published listings is
 * public, same as the rest of the marketplace's "Découvrir" experience.
 * Date/capacity/amenities filters are noted as future work, not silently
 * ignored — the search page below says so.
 */
export async function listPublishedSpaces(params: { city?: string } = {}) {
  if (useMockData) {
    const city = params.city?.toLowerCase();
    return MOCK_SPACES.filter(
      (space) => !city || space.city.toLowerCase().includes(city)
    );
  }

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
  if (useMockData) {
    return MOCK_SPACES.find((space) => space.slug === slug) ?? null;
  }

  return prisma.space.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: {
      organization: { select: { name: true } },
      openingHours: true,
    },
  });
}
