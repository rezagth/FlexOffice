"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Photo = { id: string; url: string; isPrimary: boolean; position: number };

/**
 * Photo manager for one Space: upload, delete, set primary, reorder
 * (up/down — no drag-and-drop, per Phase 5 scope). Takes its initial list
 * as a prop, loaded server-side by the page like every other form on this
 * dashboard — refetching after every mutation keeps it the single source
 * of truth from then on instead of hand-patching local state to match the
 * server.
 *
 * Talks to `/api/properties/[id]/spaces/[spaceId]/photos/*`, not a flat
 * `/api/spaces/[id]/...` — that flat shape collides with the existing
 * public `/api/spaces/[slug]/availability` route (same path depth, two
 * different dynamic segment names, which Next.js refuses outright), and
 * nesting under the property matches this phase's Property-derived
 * authorization anyway (see `requirePropertyManageAccess`).
 */
export function SpacePhotoManager({
  propertyId,
  spaceId,
  initialPhotos,
}: {
  propertyId: string;
  spaceId: string;
  initialPhotos: Photo[];
}) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/properties/${propertyId}/spaces/${spaceId}/photos`;

  async function refresh() {
    const response = await fetch(base);
    if (response.ok) {
      const body = await response.json();
      setPhotos(body.photos);
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(base, { method: "POST", body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "L'envoi d'une photo a échoué.");
        break;
      }
    }
    setUploading(false);
    await refresh();
  }

  async function handleDelete(photoId: string) {
    await fetch(`${base}/${photoId}`, { method: "DELETE" });
    await refresh();
  }

  async function handleSetPrimary(photoId: string) {
    await fetch(`${base}/${photoId}/primary`, { method: "POST" });
    await refresh();
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const reordered = [...photos];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    await fetch(`${base}/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photoIds: reordered.map((p) => p.id) }),
    });
    await refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((photo, index) => (
          <div key={photo.id} className="flex flex-col gap-1.5">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="h-28 w-full rounded-lg object-cover" />
              {photo.isPrimary && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                  Principale
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {!photo.isPrimary && (
                <Button type="button" variant="ghost" size="sm" onClick={() => handleSetPrimary(photo.id)}>
                  Principale
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={index === 0}
                onClick={() => handleMove(index, -1)}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={index === photos.length - 1}
                onClick={() => handleMove(index, 1)}
              >
                ↓
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(photo.id)}>
                Supprimer
              </Button>
            </div>
          </div>
        ))}
      </div>
      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">
        {uploading ? "Envoi…" : "Ajouter des photos"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={uploading}
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </label>
      <p className="text-xs text-muted-foreground">JPEG, PNG ou WebP · 5 Mo max par photo.</p>
    </div>
  );
}
