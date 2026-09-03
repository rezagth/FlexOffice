"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Status = "OPEN" | "INVESTIGATING" | "RESOLVED_REFUND" | "RESOLVED_NO_ACTION" | "ESCALATED";

/** Take charge / resolve (remboursement ou sans action), same shape as
 * VerificationReviewActions — an admin reviews a litige the same way it
 * reviews a dossier: a status-gated action, a reason, refreshed in place. */
export function DisputeReviewActions({ disputeId, status }: { disputeId: string; status: Status }) {
  const router = useRouter();
  const [pending, setPending] = useState<"take-charge" | "refund" | "no-action" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResolve, setShowResolve] = useState<"REFUND" | "NO_ACTION" | null>(null);
  const [notes, setNotes] = useState("");

  async function takeCharge() {
    setPending("take-charge");
    setError(null);
    try {
      const response = await fetch(`/api/admin/disputes/${disputeId}/take-charge`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
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

  async function resolve(outcome: "REFUND" | "NO_ACTION") {
    setPending(outcome === "REFUND" ? "refund" : "no-action");
    setError(null);
    try {
      const response = await fetch(`/api/admin/disputes/${disputeId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, notes }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "La résolution a échoué.");
        return;
      }
      setShowResolve(null);
      setNotes("");
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(null);
    }
  }

  if (status !== "OPEN" && status !== "INVESTIGATING") return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "OPEN" && (
          <Button size="sm" variant="outline" disabled={pending !== null} onClick={takeCharge}>
            {pending === "take-charge" ? "…" : "Prendre en charge"}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="border-danger/40 text-danger hover:bg-danger/10"
          disabled={pending !== null || status !== "INVESTIGATING"}
          onClick={() => setShowResolve("REFUND")}
        >
          Rembourser
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending !== null || status !== "INVESTIGATING"}
          onClick={() => setShowResolve("NO_ACTION")}
        >
          Clore sans action
        </Button>
      </div>

      {status === "OPEN" && (
        <p className="text-xs text-muted-foreground">
          Prenez le litige en charge avant de pouvoir le résoudre.
        </p>
      )}

      {showResolve && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <label htmlFor={`dispute-notes-${disputeId}`} className="text-xs font-medium text-foreground">
            {showResolve === "REFUND" ? "Motif du remboursement" : "Motif de la clôture"}
          </label>
          <textarea
            id={`dispute-notes-${disputeId}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground"
          />
          <Button
            size="sm"
            variant="outline"
            className={
              showResolve === "REFUND" ? "self-start border-danger/40 text-danger hover:bg-danger/10" : "self-start"
            }
            disabled={pending !== null || notes.trim().length === 0}
            onClick={() => resolve(showResolve)}
          >
            {pending ? "…" : showResolve === "REFUND" ? "Confirmer le remboursement" : "Confirmer la clôture"}
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
