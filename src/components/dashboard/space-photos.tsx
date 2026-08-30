"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Photo manager for an existing space. Upload needs a space to attach to,
 * so it only appears once the draft is saved — the create form explains
 * that rather than silently hiding the feature.
 */
export function SpacePhotos({
  spaceId,
  initialPhotos,
}: {
  spaceId: string;
  initialPhotos: string[];
}) {
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch(`/api/partner/spaces/${spaceId}/photos`, {
          method: "POST",
          body,
        });
        const json = await response.json();
        if (!response.ok) {
          setError(json?.error?.message ?? "L'envoi a échoué.");
          break;
        }
        setPhotos(json.photos);
      }
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(url: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/partner/spaces/${spaceId}/photos?url=${encodeURIComponent(url)}`,
        { method: "DELETE" }
      );
      const json = await response.json();
      if (!response.ok) {
        setError(json?.error?.message ?? "La suppression a échoué.");
        return;
      }
      setPhotos(json.photos);
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((url) => (
            <li key={url} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="aspect-video w-full rounded-lg border border-border object-cover"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => remove(url)}
              >
                Supprimer
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy}
          onChange={(e) => upload(e.target.files)}
          className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-4 file:py-2 file:text-sm file:font-medium"
        />
        <p className="text-xs text-muted-foreground">
          JPEG, PNG ou WebP, 5 Mo maximum par photo, 10 photos par espace.
        </p>
        {busy && <p className="text-xs text-muted-foreground">Envoi en cours…</p>}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
