"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiErrorMessage, NETWORK_ERROR_MESSAGE } from "@/lib/api-error";
import { canOptimizeImage } from "@/lib/images";

export type ManagedPhoto = { id: string; url: string; isPrimary: boolean; position: number };

/**
 * Photo manager: upload, delete (after confirmation), set primary, reorder
 * (up/down — no drag-and-drop, per Phase 5 scope). Takes its initial list as
 * a prop, loaded server-side by the page like every other form on this
 * dashboard — refetching after every mutation keeps it the single source of
 * truth instead of hand-patching local state to match the server.
 *
 * Every mutation reports its failure (UX-22): an error used to be ignored,
 * so a photo that could not be deleted simply stayed there without a word.
 *
 * Shared by SpacePhotoManager and PropertyPhotoManager, which differ only by
 * the API base path.
 */
export function PhotoManager({
  baseUrl,
  initialPhotos,
}: {
  /** e.g. `/api/properties/<id>/photos` — sub-routes `/<photoId>`,
   * `/<photoId>/primary` and `/reorder` hang off it. */
  baseUrl: string;
  initialPhotos: ManagedPhoto[];
}) {
  const [photos, setPhotos] = useState<ManagedPhoto[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        const body = await response.json();
        setPhotos(body.photos);
      }
    } catch {
      // The mutation itself already succeeded or reported its own error;
      // a stale list is fixed by the next reload.
    }
  }

  /** Runs one mutation; returns its error message, or null on success. */
  async function mutate(request: () => Promise<Response>, fallback: string): Promise<string | null> {
    try {
      const response = await request();
      if (!response.ok) return await apiErrorMessage(response, fallback);
      return null;
    } catch {
      return NETWORK_ERROR_MESSAGE;
    } finally {
      await refresh();
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      const failure = await mutate(
        () => fetch(baseUrl, { method: "POST", body: formData }),
        "L'envoi d'une photo a échoué."
      );
      if (failure) {
        setError(failure);
        break;
      }
    }
    setUploading(false);
  }

  async function handleSetPrimary(photoId: string) {
    setBusy(true);
    setError(null);
    setError(
      await mutate(
        () => fetch(`${baseUrl}/${photoId}/primary`, { method: "POST" }),
        "La photo principale n'a pas pu être changée."
      )
    );
    setBusy(false);
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const reordered = [...photos];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setBusy(true);
    setError(null);
    setError(
      await mutate(
        () =>
          fetch(`${baseUrl}/reorder`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ photoIds: reordered.map((p) => p.id) }),
          }),
        "L'ordre des photos n'a pas pu être enregistré."
      )
    );
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((photo, index) => {
          const position = `photo ${index + 1} sur ${photos.length}`;
          return (
            <li key={photo.id} className="flex flex-col gap-1.5">
              <div className="relative h-28 overflow-hidden rounded-lg bg-muted">
                <Image
                  src={photo.url}
                  alt={`Photo ${index + 1}${photo.isPrimary ? " (principale)" : ""}`}
                  fill
                  sizes="(min-width: 640px) 25vw, 50vw"
                  unoptimized={!canOptimizeImage(photo.url)}
                  className="object-cover"
                />
                {photo.isPrimary && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    Principale
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {!photo.isPrimary && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => handleSetPrimary(photo.id)}
                    aria-label={`Définir la ${position} comme photo principale`}
                  >
                    Principale
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || index === 0}
                  onClick={() => handleMove(index, -1)}
                  aria-label={`Avancer la ${position}`}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || index === photos.length - 1}
                  onClick={() => handleMove(index, 1)}
                  aria-label={`Reculer la ${position}`}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={`Supprimer la ${position}`}
                    >
                      Supprimer
                    </Button>
                  }
                  title="Supprimer cette photo ?"
                  description="La photo est retirée de l'annonce et supprimée définitivement."
                  confirmLabel="Supprimer la photo"
                  pendingLabel="Suppression…"
                  onConfirm={() =>
                    mutate(
                      () => fetch(`${baseUrl}/${photo.id}`, { method: "DELETE" }),
                      "La photo n'a pas pu être supprimée."
                    )
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
        {uploading ? "Envoi…" : "Ajouter des photos"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={uploading}
          className="sr-only"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </label>
      <p className="text-xs text-muted-foreground">JPEG, PNG ou WebP · 5 Mo max par photo.</p>
    </div>
  );
}

/**
 * Photos of one Space. Talks to `/api/properties/[id]/spaces/[spaceId]/photos/*`,
 * not a flat `/api/spaces/[id]/...` — that flat shape collides with the
 * public `/api/spaces/[slug]/availability` route (same path depth, two
 * different dynamic segment names, which Next.js refuses outright), and
 * nesting under the property matches the Property-derived authorization
 * (see `requirePropertyManageAccess`).
 */
export function SpacePhotoManager({
  propertyId,
  spaceId,
  initialPhotos,
}: {
  propertyId: string;
  spaceId: string;
  initialPhotos: ManagedPhoto[];
}) {
  return (
    <PhotoManager
      baseUrl={`/api/properties/${propertyId}/spaces/${spaceId}/photos`}
      initialPhotos={initialPhotos}
    />
  );
}
