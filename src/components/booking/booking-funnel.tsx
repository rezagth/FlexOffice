"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { StripeCardStep } from "./stripe-card-step";
import { formatCents } from "@/lib/format";
import {
  FULL_REFUND_MIN_HOURS,
  PARTIAL_REFUND_MIN_HOURS,
  PARTIAL_REFUND_PERCENT,
} from "@/lib/cancellation-policy";
import { CGV_VERSION } from "@/lib/legal-versions";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export type SlotKind = "MORNING" | "AFTERNOON" | "FULL_DAY";
/** `startsAt`/`endsAt` are ISO instants computed server-side (availability),
 * shown in the recap only — the server recomputes the slot on submit. */
export type SlotOption = {
  kind: SlotKind;
  available: boolean;
  priceCents: number;
  startsAt?: string;
  endsAt?: string;
};

/** "lundi 4 mars 2030" for a calendar day "2030-03-04" (UX-17). Formatted
 * in UTC from UTC noon, so no time zone can shift it to the previous or
 * next day. */
export function formatBookingDate(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  if (!year || !month || !day) return isoDay;
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

/** "9 h 00 – 13 h 00" in the space's own time zone, or null when the slot
 * carries no times. */
export function formatSlotHours(slot: Pick<SlotOption, "startsAt" | "endsAt">, timeZone: string): string | null {
  if (!slot.startsAt || !slot.endsAt) return null;
  const start = new Date(slot.startsAt);
  const end = new Date(slot.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const time = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", minute: "2-digit", timeZone });
  const label = (d: Date) => time.format(d).replace(":", " h ");
  return `${label(start)} – ${label(end)}`;
}

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
  timeZone = DEFAULT_TIMEZONE,
}: {
  spaceId: string;
  spaceName: string;
  date: string;
  slots: SlotOption[];
  capacity: number;
  /** The space's IANA zone — slot hours are shown in it. */
  timeZone?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<SlotKind | null>(null);
  const [participants, setParticipants] = useState("2");
  const [purpose, setPurpose] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
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
    // B-11: the CGV must be accepted before the request leaves the browser.
    // The server requires it too (createBookingSchema) and stamps the
    // version and date itself.
    if (!acceptTerms) {
      setTermsError("Vous devez accepter les conditions générales de vente pour envoyer la demande.");
      document.getElementById("acceptCgv")?.focus();
      return;
    }
    setTermsError(null);
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
          acceptTerms: true,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "La demande n'a pas pu être envoyée.");
        return;
      }
      if (body.clientSecret) {
        // Real Stripe: the booking exists as a short card hold
        // (AWAITING_PAYMENT). It becomes a request sent to the landlord only
        // when Stripe confirms the authorization (webhook); /app/bookings
        // shows the real status ("Paiement en cours" until then).
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
          <RadioGroup
            value={selected ?? undefined}
            onValueChange={(value) => setSelected(value as SlotKind)}
          >
            {slots.map((slot) => (
              <label
                key={slot.kind}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-4 py-3 text-sm",
                  !slot.available
                    ? "border-border bg-muted text-muted-foreground"
                    : selected === slot.kind
                      ? "border-primary"
                      : "border-border hover:bg-muted"
                )}
              >
                <span className="flex items-center gap-3">
                  <RadioGroupItem value={slot.kind} disabled={!slot.available} />
                  {SLOT_LABELS[slot.kind]}
                  {!slot.available && <span className="text-xs">— indisponible</span>}
                </span>
                <span className="font-medium">{formatCents(slot.priceCents)}</span>
              </label>
            ))}
          </RadioGroup>
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
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Espace</dt>
                <dd className="text-right font-medium">{spaceName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Date</dt>
                <dd className="text-right font-medium first-letter:uppercase">{formatBookingDate(date)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Créneau</dt>
                <dd className="text-right font-medium">
                  {SLOT_LABELS[selectedSlot.kind]}
                  {formatSlotHours(selectedSlot, timeZone) && <> · {formatSlotHours(selectedSlot, timeZone)}</>}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border pt-2">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-semibold">{formatCents(selectedSlot.priceCents)}</dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">
              Votre demande est envoyée à l&apos;entreprise. Vous ne serez débité
              qu&apos;après son acceptation.
            </p>
            <div className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Conditions d&apos;annulation</p>
              <ul className="mt-1 list-disc pl-5">
                <li>Gratuite tant que l&apos;entreprise n&apos;a pas accepté votre demande.</li>
                <li>
                  Une fois la réservation confirmée : remboursement intégral plus de{" "}
                  {FULL_REFUND_MIN_HOURS} h avant le début, {PARTIAL_REFUND_PERCENT} % entre{" "}
                  {FULL_REFUND_MIN_HOURS} h et {PARTIAL_REFUND_MIN_HOURS} h, aucun remboursement
                  à moins de {PARTIAL_REFUND_MIN_HOURS} h.
                </li>
                <li>Les frais de service OfficeFlex ne sont pas remboursables.</li>
              </ul>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sélectionnez un créneau disponible.</p>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-start gap-3">
            <input
              id="acceptCgv"
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => {
                setAcceptTerms(e.target.checked);
                if (e.target.checked) setTermsError(null);
              }}
              aria-invalid={termsError ? true : undefined}
              aria-describedby={termsError ? "acceptCgv-error" : undefined}
              className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
            />
            <label htmlFor="acceptCgv" className="text-sm text-foreground">
              J&apos;accepte les{" "}
              <a href="/cgv" target="_blank" className="font-medium text-primary underline underline-offset-2">
                conditions générales de vente
              </a>{" "}
              (version du {CGV_VERSION}), y compris les conditions d&apos;annulation.
            </label>
          </div>
          {termsError && (
            <p id="acceptCgv-error" className="text-xs text-danger">
              {termsError}
            </p>
          )}
        </div>

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
