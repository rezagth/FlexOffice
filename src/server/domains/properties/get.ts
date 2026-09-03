import { prisma } from "@/server/db/prisma";
import { getPublicPhotoUrl } from "@/server/domains/media/photo-storage";

const HOLDER_SELECT = {
  profile: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true } },
} as const;

/**
 * The portfolio view ("Mes biens"): every property the organization
 * currently owns, operates, or manages. Deduplicated by the query itself —
 * an organization that is both owner and operator of the same property (the
 * default `createProperty()` shape) sees it once, not twice.
 *
 * "Currently" means an ACTIVE relation (`endsAt IS NULL`) — a property this
 * organization used to operate but no longer does must not linger in its
 * list.
 */
export async function listPropertiesForOrg(organizationId: string) {
  const properties = await prisma.property.findMany({
    where: {
      OR: [
        { owners: { some: { organizationId, endsAt: null } } },
        { operators: { some: { organizationId, endsAt: null } } },
        { managers: { some: { organizationId, endsAt: null } } },
      ],
    },
    include: {
      _count: { select: { spaces: true } },
      photos: { where: { isPrimary: true }, take: 1 },
      owners: { where: { endsAt: null }, include: HOLDER_SELECT },
      operators: { where: { endsAt: null }, include: HOLDER_SELECT },
    },
    orderBy: { createdAt: "desc" },
  });

  return properties.map((p) => ({
    ...p,
    primaryPhotoUrl: p.photos[0] ? getPublicPhotoUrl(p.photos[0].storagePath) : null,
  }));
}

/** Full detail for the property page: every role holder, every Space, and
 * every photo — access is checked by the caller via
 * `requirePropertyManageAccess()` before this runs. */
export async function getPropertyDetail(propertyId: string) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      owners: { include: HOLDER_SELECT },
      operators: { include: HOLDER_SELECT },
      managers: { include: HOLDER_SELECT },
      spaces: {
        orderBy: { createdAt: "desc" },
        include: { spacePhotos: { where: { isPrimary: true }, take: 1 } },
      },
      photos: { orderBy: { position: "asc" } },
    },
  });
  if (!property) return null;

  return {
    ...property,
    spaces: property.spaces.map((s) => ({
      ...s,
      primaryPhotoUrl: s.spacePhotos[0] ? getPublicPhotoUrl(s.spacePhotos[0].storagePath) : null,
    })),
    photos: property.photos.map((p) => ({ ...p, url: getPublicPhotoUrl(p.storagePath) })),
  };
}
