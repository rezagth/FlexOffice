"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Loaded once per page load, not per render — loadStripe() itself caches,
// but a module-scope call keeps the intent explicit.
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

/**
 * Authorizes the card for a booking request already created server-side
 * (PENDING booking + REQUIRES_CAPTURE payment — see create-booking.ts).
 * This step only confirms the PaymentIntent; it does not capture it and
 * does not itself change the booking's status. Under `capture_method:
 * "manual"`, a successful confirmation here moves the intent to
 * "requires_capture" (authorized, not charged) — the booking stays PENDING
 * until the landlord accepts or refuses (accept-reject.ts), exactly the
 * "vous ne serez débité qu'après acceptation" already promised in the
 * previous step.
 *
 * `redirect: "if_required"` resolves in-page for the common case; Stripe
 * still redirects to `returnUrl` when the card needs an extra step (3D
 * Secure) — unavoidable under French/EU card rules (SCA), not a bug in
 * this flow.
 */
function CardForm({ onSuccess, returnUrl }: { onSuccess: () => void; returnUrl: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Le paiement a été refusé. Vérifiez vos informations.");
      setSubmitting(false);
      return;
    }

    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!stripe || submitting}>
        {submitting ? "Vérification…" : "Autoriser le paiement"}
      </Button>
    </form>
  );
}

export function StripeCardStep({
  clientSecret,
  returnUrl,
  onSuccess,
}: {
  clientSecret: string;
  returnUrl: string;
  onSuccess: () => void;
}) {
  if (!stripePromise) {
    return (
      <Card className="p-5">
        <p className="text-sm text-danger">
          Le paiement n&apos;est pas configuré (clé publique Stripe absente). Contactez le
          support.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-lg font-medium">5. Paiement</h2>
      <p className="text-sm text-muted-foreground">
        Vos coordonnées bancaires sont autorisées maintenant, mais vous ne serez débité
        qu&apos;après acceptation de votre demande par l&apos;entreprise.
      </p>
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <CardForm onSuccess={onSuccess} returnUrl={returnUrl} />
      </Elements>
    </Card>
  );
}
