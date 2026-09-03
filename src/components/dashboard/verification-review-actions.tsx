"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Status = "PENDING_REVIEW" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "EXPIRED" | "DRAFT";

/**
 * Take charge / approve / reject, for a dossier this admin did not request
 * themselves — the server re-checks that (Cas 4), this component only keeps
 * a caller from firing a request the button's own state already rules out.
 *
 * Reject needs a reason (`rejectVerificationSchema` requires 1-1000 chars),
 * so its input opens inline rather than navigating away.
 */
export function VerificationReviewActions({
  verificationId,
  status,
}: {
  verificationId: string;
  status: Status;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"take-charge" | "approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  async function post(action: "take-charge" | "approve", body?: unknown) {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/admin/verifications/${verificationId}/${action}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const responseBody = await response.json().catch(() => null);
        setError(responseBody?.error?.message ?? "L'action a échoué.");
        return;
      }
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(null);
    }
  }

  async function handleReject() {
    setPending("reject");
    setError(null);
    try {
      const response = await fetch(`/api/admin/verifications/${verificationId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "Le refus a échoué.");
        return;
      }
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(null);
    }
  }

  if (status !== "PENDING_REVIEW" && status !== "IN_REVIEW") {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "PENDING_REVIEW" && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => post("take-charge")}
          >
            {pending === "take-charge" ? "…" : "Prendre en charge"}
          </Button>
        )}
        <Button
          size="sm"
          disabled={pending !== null || status !== "IN_REVIEW"}
          onClick={() => post("approve")}
        >
          {pending === "approve" ? "…" : "Approuver"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-danger/40 text-danger hover:bg-danger/10"
          disabled={pending !== null || status !== "IN_REVIEW"}
          onClick={() => setShowReject((prev) => !prev)}
        >
          Refuser
        </Button>
      </div>

      {status === "PENDING_REVIEW" && (
        <p className="text-xs text-muted-foreground">
          Prenez le dossier en charge avant de pouvoir l&apos;approuver ou le refuser.
        </p>
      )}

      {showReject && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <label htmlFor="reject-reason" className="text-xs font-medium text-foreground">
            Motif du refus
          </label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground"
            placeholder="Expliquez ce qui manque ou ce qui ne correspond pas, pour que le bailleur puisse corriger son dossier."
          />
          <Button
            size="sm"
            variant="outline"
            className="self-start border-danger/40 text-danger hover:bg-danger/10"
            disabled={pending !== null || reason.trim().length === 0}
            onClick={handleReject}
          >
            {pending === "reject" ? "…" : "Confirmer le refus"}
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
