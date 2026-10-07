"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const RATING_LABELS = ["", "Très décevant", "Décevant", "Correct", "Bien", "Excellent"];

/**
 * "Donner mon avis" on a finished booking. Opens inline (same pattern as
 * the dispute button). The rating is a real radio group — keyboard arrows
 * move between the five stars, and each has a spoken label.
 */
export function ReviewForm({ bookingId, spaceName }: { bookingId: string; spaceName: string }) {
  const router = useRouter();
  const groupId = useId();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (rating < 1) {
      setError("Choisissez une note de 1 à 5.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "L'envoi de votre avis a échoué.");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="text-xs font-medium text-primary">
        Merci pour votre avis !
      </p>
    );
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Donner mon avis
      </Button>
    );
  }

  const shown = hover || rating;
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border p-3 text-left sm:w-96">
      <fieldset>
        <legend id={`${groupId}-legend`} className="text-sm font-medium text-foreground">
          Votre note pour « {spaceName} »
        </legend>
        <div
          role="radiogroup"
          aria-labelledby={`${groupId}-legend`}
          className="mt-2 flex items-center gap-1"
          onMouseLeave={() => setHover(0)}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
              <input
                type="radio"
                name={`${groupId}-rating`}
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="peer sr-only"
                aria-label={`${n} sur 5 — ${RATING_LABELS[n]}`}
              />
              <Star
                aria-hidden="true"
                className={cn(
                  "size-7 rounded-sm transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                  n <= shown ? "text-accent" : "text-border"
                )}
                fill="currentColor"
                strokeWidth={0}
              />
            </label>
          ))}
          <span className="ml-2 text-xs text-muted-foreground" aria-hidden="true">
            {shown ? RATING_LABELS[shown] : ""}
          </span>
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${groupId}-comment`} className="text-xs font-medium text-foreground">
          Votre commentaire (facultatif)
        </label>
        <Textarea
          id={`${groupId}-comment`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="L'accueil, le calme, l'équipement, la propreté… ce qui aidera le prochain professionnel à choisir."
        />
        <p className="text-xs text-muted-foreground">
          Votre prénom et l&apos;initiale de votre nom seront affichés avec l&apos;avis. Il ne pourra plus être
          modifié ; l&apos;entreprise pourra y répondre.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={submit}>
          {pending ? "Envoi…" : "Publier mon avis"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
