"use client";

import { PhotoManager, type ManagedPhoto } from "./space-photo-manager";

/** Property counterpart of `SpacePhotoManager` — same component (upload,
 * confirmed delete, primary, reorder, visible errors) against
 * `/api/properties/[id]/photos/*`. */
export function PropertyPhotoManager({
  propertyId,
  initialPhotos,
}: {
  propertyId: string;
  initialPhotos: ManagedPhoto[];
}) {
  return <PhotoManager baseUrl={`/api/properties/${propertyId}/photos`} initialPhotos={initialPhotos} />;
}
