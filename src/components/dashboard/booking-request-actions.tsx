"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function BookingRequestActions({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "accept" | "reject") {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/partner/bookings/${bookingId}/${action}`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json();
        setError(body?.error?.message ?? "L'action a échoué.");
        return;
      }
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => act("accept")} disabled={pending !== null}>
          {pending === "accept" ? "…" : "Accepter"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => act("reject")}
          disabled={pending !== null}
        >
          {pending === "reject" ? "…" : "Refuser"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
