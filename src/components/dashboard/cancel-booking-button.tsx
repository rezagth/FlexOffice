"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/format";

/**
 * Two-step cancellation: the first click shows what will happen to the
 * money, the second confirms. The amount shown is informative only — the
 * server recomputes it (bookings/cancel.ts) and the response is what the
 * client actually gets.
 */
export function CancelBookingButton({
  endpoint,
  consequence,
  label = "Annuler la réservation",
}: {
  /** `/api/bookings/<id>/cancel` (client) or `/api/partner/bookings/<id>/cancel` (landlord). */
  endpoint: string;
  /** One sentence telling the user what they get back / what happens. */
  consequence: string;
  label?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error?.message ?? "L'annulation a échoué.");
        return;
      }
      setDone(
        body?.refundCents > 0
          ? `Annulée. Remboursement de ${formatCents(body.refundCents)} en cours.`
          : "Annulée."
      );
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(false);
    }
  }

  if (done) return <p className="text-xs font-medium text-primary">{done}</p>;

  if (!confirming) {
    return (
      <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-2 rounded-lg border border-border p-3 text-left" role="group" aria-label="Confirmer l'annulation">
      <p className="text-sm text-foreground">{consequence}</p>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={handleConfirm} disabled={pending}>
          {pending ? "Annulation…" : "Confirmer l'annulation"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
          Garder la réservation
        </Button>
      </div>
    </div>
  );
}
