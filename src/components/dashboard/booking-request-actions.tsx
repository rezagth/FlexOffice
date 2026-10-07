"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage, NETWORK_ERROR_MESSAGE } from "@/lib/api-error";

const REASON_MAX_LENGTH = 1000;

/**
 * Accept / refuse a pending booking request.
 *
 * Refusing releases the client's card authorization and cannot be undone, so
 * it goes through a confirmation (UX-22). The optional reason is sent to the
 * client as a message in the booking's conversation (POST
 * /api/bookings/[id]/messages) just before the refusal: the reject endpoint
 * itself stores no reason. The message is sent first so a refusal never
 * happens without the explanation the landlord wrote; if sending it fails,
 * nothing is refused and the error is shown.
 */
export function BookingRequestActions({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function accept() {
    setAccepting(true);
    setError(null);
    try {
      const response = await fetch(`/api/partner/bookings/${bookingId}/accept`, { method: "POST" });
      if (!response.ok) {
        setError(await apiErrorMessage(response, "L'acceptation a échoué."));
        return;
      }
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setAccepting(false);
    }
  }

  async function reject(): Promise<string | null> {
    try {
      const trimmed = reason.trim();
      if (trimmed) {
        const sent = await fetch(`/api/bookings/${bookingId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: `Motif du refus : ${trimmed}` }),
        });
        if (!sent.ok) {
          return await apiErrorMessage(sent, "Le motif n'a pas pu être envoyé. La demande n'a pas été refusée.");
        }
      }
      const response = await fetch(`/api/partner/bookings/${bookingId}/reject`, { method: "POST" });
      if (!response.ok) return await apiErrorMessage(response, "Le refus a échoué.");
      setReason("");
      router.refresh();
      return null;
    } catch {
      return NETWORK_ERROR_MESSAGE;
    }
  }

  const reasonId = `reject-reason-${bookingId}`;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" onClick={accept} disabled={accepting}>
          {accepting ? "Acceptation…" : "Accepter"}
        </Button>
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline" disabled={accepting}>
              Refuser
            </Button>
          }
          title="Refuser cette demande ?"
          description="L'empreinte bancaire du client est libérée et le créneau redevient disponible. Cette action est définitive."
          confirmLabel="Refuser la demande"
          pendingLabel="Refus…"
          onConfirm={reject}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={reasonId}>Motif (facultatif)</Label>
            <Textarea
              id={reasonId}
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ex. : l'espace est indisponible ce jour-là pour travaux."
              aria-describedby={`${reasonId}-hint`}
              className="min-h-20"
            />
            <p id={`${reasonId}-hint`} className="text-xs text-muted-foreground">
              Envoyé au client dans la messagerie de la réservation.
            </p>
          </div>
        </ConfirmDialog>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
