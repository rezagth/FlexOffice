"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/auth/form-field";

const REASON_OPTIONS = [
  { value: "INCONSISTENT_PRICE", label: "Prix incohérent" },
  { value: "INVALID_DATES", label: "Dates invalides" },
  { value: "INAPPROPRIATE_CONTENT", label: "Contenu inapproprié" },
  { value: "MISSING_INFORMATION", label: "Informations manquantes" },
  { value: "OTHER", label: "Autre" },
] as const;

/** R48-R52 — approve, or refuse with a mandatory reason from a fixed list
 * ("Autre" also requires a free-text note). Either decision notifies the
 * partner in-app. */
export function PromotionReviewActions({ promotionId }: { promotionId: string }) {
  const router = useRouter();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState<(typeof REASON_OPTIONS)[number]["value"]>("INCONSISTENT_PRICE");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function approve() {
    setMessage(null);
    setPending(true);
    try {
      const response = await fetch(`/api/admin/promotions/${promotionId}/approve`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setMessage({ tone: "error", text: body?.error?.message ?? "La promotion n'a pas pu être approuvée." });
        return;
      }
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Une erreur réseau est survenue. Réessayez." });
    } finally {
      setPending(false);
    }
  }

  async function reject() {
    if (reason === "OTHER" && !note.trim()) {
      setMessage({ tone: "error", text: "Précisez le motif du refus." });
      return;
    }
    setMessage(null);
    setPending(true);
    try {
      const response = await fetch(`/api/admin/promotions/${promotionId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note: note.trim() || undefined }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setMessage({ tone: "error", text: body?.error?.message ?? "Le refus n'a pas pu être enregistré." });
        return;
      }
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
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={approve} disabled={pending}>
          {pending ? "…" : "Approuver"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowReject((v) => !v)}
          disabled={pending}
        >
          Refuser
        </Button>
      </div>
      {showReject && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground"
            aria-label="Motif du refus"
          >
            {REASON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={reason === "OTHER" ? "Précisez le motif (obligatoire)" : "Précision (facultative)"}
            rows={2}
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <Button
            type="button"
            size="sm"
            variant="primary"
            className="bg-danger text-primary-foreground hover:bg-danger/90"
            onClick={reject}
            disabled={pending}
          >
            {pending ? "Envoi…" : "Confirmer le refus"}
          </Button>
        </div>
      )}
    </div>
  );
}
