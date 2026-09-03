"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Opens inline rather than navigating away, same pattern as the
 * verification rejection reason (verification-review-actions.tsx). */
export function RaiseDisputeButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/disputes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "Le signalement a échoué.");
        return;
      }
      setOpen(false);
      setDescription("");
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Signaler un litige
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-border p-3">
      <label htmlFor={`dispute-${bookingId}`} className="text-xs font-medium text-foreground">
        Décrivez le problème
      </label>
      <textarea
        id={`dispute-${bookingId}`}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground"
        placeholder="Ce qui ne correspond pas à ce qui était annoncé, ou tout autre désaccord sur cette réservation."
      />
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || description.trim().length === 0}
          onClick={handleSubmit}
        >
          {pending ? "Envoi…" : "Envoyer le signalement"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
