"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/auth/form-field";

const STATUS_OPTIONS = [
  { value: "REQUESTED", label: "Demande envoyée" },
  { value: "IN_PROGRESS", label: "En cours de traitement" },
  { value: "ACCEPTED", label: "Acceptée" },
  { value: "REFUSED", label: "Refusée" },
] as const;

/** Applies to either kind (MAKOMSPACE or THIRD_PARTY) — same action either
 * way, see domiciliation.ts's own doc comment. Changing the status notifies
 * the company in-app (R68). */
export function DomiciliationReviewActions({
  requestId,
  initialStatus,
  initialNotes,
}: {
  requestId: string;
  initialStatus: "REQUESTED" | "IN_PROGRESS" | "ACCEPTED" | "REFUSED";
  initialNotes: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function save() {
    setMessage(null);
    setPending(true);
    try {
      const response = await fetch(`/api/admin/domiciliations/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes: notes.trim() || undefined }),
      });
      if (!response.ok) {
        setMessage({ tone: "error", text: "Le changement n'a pas pu être enregistré." });
        return;
      }
      setMessage({ tone: "success", text: "Mis à jour. La société a été notifiée." });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Une erreur réseau est survenue. Réessayez." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground"
          aria-label="Statut de la demande"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (admin uniquement)"
        rows={2}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
      />
    </div>
  );
}
