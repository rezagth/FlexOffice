"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Adds a closed period on a space — the partner's way of blocking dates
 * they need for themselves. */
export function ClosureForm({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/partner/spaces/${spaceId}/closures`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startsAt, endsAt, reason }),
      });
      if (!response.ok) {
        const body = await response.json();
        setError(body?.error?.message ?? "L'ajout a échoué.");
        return;
      }
      setStartsAt("");
      setEndsAt("");
      setReason("");
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Début" htmlFor="closureStart">
          <Input
            id="closureStart"
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </Field>
        <Field label="Fin" htmlFor="closureEnd">
          <Input
            id="closureEnd"
            type="datetime-local"
            required
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Motif" htmlFor="closureReason">
        <Input
          id="closureReason"
          required
          maxLength={255}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Ajout…" : "Ajouter une fermeture"}
        </Button>
      </div>
    </form>
  );
}
