"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function StripeConnectButton({ label }: { label: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/landlord/stripe/connect", { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "La connexion à Stripe a échoué.");
        setPending(false);
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("Une erreur réseau est survenue.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" disabled={pending} onClick={handleClick}>
        {pending ? "Redirection…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
