import { prisma } from "@/server/db/prisma";
import { STATUSES_ALLOWED_TO_PUBLISH } from "@/server/domains/organizations/publication-guard";
import { MOCK_SPACES } from "./mock-data";

// No DATABASE_URL configured yet (e.g. a demo deploy without Supabase
// wired up): fall back to static demo data instead of erroring, so the
// public pages stay browsable. Once DATABASE_URL is set this branch never
// runs — see mock-data.ts.
const useMockData = !process.env.DATABASE_URL;

/**
 * The organization side of "is this listing publicly visible".
 *
 * A space being PUBLISHED was the only condition, so suspending an
 * organization left its listings live, bookable and payable. Now that the
 * booking tunnel works end to end, that is not a cosmetic gap: a suspended
 * partner could still take money.
 *
 * Kept in one place so every public read applies the same rule — a new query
 * that forgets it reopens the hole. See publication-guard.ts for why the
 * threshold is what it is today.
 */
function publiclyVisibleOrganization() {
  // Rebuilt per call, and the readonly policy list copied into a mutable
  // array: Prisma's generated `in` filter type is mutable, and a shared
  // object literal would be reused across concurrent queries.
  return { status: { in: [...STATUSES_ALLOWED_TO_PUBLISH] } };
}

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
      organization: publiclyVisibleOrganization(),
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
    where: {
      slug,
      status: "PUBLISHED",
      organization: publiclyVisibleOrganization(),
    },
    include: {
      organization: { select: { name: true } },
      openingHours: true,
    },
  });
}
