"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StripeCardStep } from "./stripe-card-step";
import { formatCents } from "@/lib/format";

export type SlotKind = "MORNING" | "AFTERNOON" | "FULL_DAY";
export type SlotOption = { kind: SlotKind; available: boolean; priceCents: number };

const SLOT_LABELS: Record<SlotKind, string> = {
  MORNING: "Matin",
  AFTERNOON: "Après-midi",
  FULL_DAY: "Journée complète",
};

/**
 * Second half of the booking funnel: the day and its slots are computed
 * server-side (see the page), so this only owns the choice itself, the
 * request, and — when the real Stripe provider is active — the card step
 * that follows it. The mock provider returns no `clientSecret`, so that
 * step is skipped entirely and the funnel behaves exactly as before: the
 * client is only ever charged once the partner accepts the request,
 * whichever provider is active.
 */
export function BookingFunnel({
  spaceId,
  spaceName,
  date,
  slots,
  capacity,
}: {
  spaceId: string;
  spaceName: string;
  date: string;
  slots: SlotOption[];
  capacity: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<SlotKind | null>(null);
  const [participants, setParticipants] = useState("2");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set only when the real Stripe provider returns one — the mock
  // provider's response never has it, so this stays null and the funnel
  // finishes on the same request as before.
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const selectedSlot = slots.find((slot) => slot.kind === selected) ?? null;

  function finish() {
    router.push("/app/bookings");
    router.refresh();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          spaceId,
          date,
          slot: selected,
          participantsCount: Number(participants),
          purpose,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "La demande n'a pas pu être envoyée.");
        return;
      }
      if (body.clientSecret) {
        // Real Stripe: the request already exists (PENDING), but the card
        // still needs to be authorized before this is a genuine hold.
        setClientSecret(body.clientSecret);
        return;
      }
      finish();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  if (clientSecret) {
    return (
      <StripeCardStep
        clientSecret={clientSecret}
        returnUrl={typeof window !== "undefined" ? `${window.location.origin}/app/bookings` : "/app/bookings"}
        onSuccess={finish}
      />
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-medium">2. Choisissez un créneau</h2>
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {spaceName} est fermé ce jour-là. Choisissez une autre date.
          </p>
        ) : (
          slots.map((slot) => (
            <label
              key={slot.kind}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
                !slot.available
                  ? "border-border bg-muted text-muted-foreground"
                  : selected === slot.kind
                    ? "border-primary"
                    : "border-border hover:bg-muted"
              }`}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="slot"
                  value={slot.kind}
                  disabled={!slot.available}
                  checked={selected === slot.kind}
                  onChange={() => setSelected(slot.kind)}
                />
                {SLOT_LABELS[slot.kind]}
                {!slot.available && <span className="text-xs">— indisponible</span>}
              </span>
              <span className="font-medium">{formatCents(slot.priceCents)}</span>
            </label>
          ))
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">3. Informations</h2>
        <Field label="Nombre de participants" htmlFor="participants">
          <Input
            id="participants"
            type="number"
            min={1}
            max={capacity}
            required
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
          />
        </Field>
        <Field label="Motif de la réservation" htmlFor="purpose">
          <Textarea
            id="purpose"
            required
            maxLength={500}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-medium">4. Récapitulatif</h2>
        {selectedSlot ? (
          <>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">
                {spaceName} · {SLOT_LABELS[selectedSlot.kind]} du {date}
              </span>
              <span className="font-medium">{formatCents(selectedSlot.priceCents)}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Votre demande est envoyée à l&apos;entreprise. Vous ne serez débité
              qu&apos;après son acceptation.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sélectionnez un créneau disponible.</p>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div>
          <Button type="submit" disabled={!selected || submitting}>
            {submitting ? "Envoi…" : "Envoyer la demande"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
