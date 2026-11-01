"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CONTENT_REPORT_REASON_LABELS } from "@/lib/validation/reports";

type Reason = keyof typeof CONTENT_REPORT_REASON_LABELS;

/**
 * "Signaler cette annonce" — the public notice mechanism. Works without an
 * account; the email is optional and only used to answer the reporter. The
 * report goes to the admin "À traiter" queue (see domains/reports).
 */
export function ReportSpaceButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>("NOT_AUTHORIZED");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/spaces/${encodeURIComponent(slug)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, message, email: email.trim() || undefined }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.issues?.[0]?.message ?? body?.error?.message ?? "L'envoi a échoué.");
        return;
      }
      setSent(true);
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Merci, votre signalement a été transmis à notre équipe. Elle l&apos;examine et peut masquer l&apos;annonce si besoin.
      </p>
    );
  }

  if (!open) {
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)} className="text-sm text-muted-foreground underline">
          Signaler cette annonce
        </button>
      </div>
    );
  }

  return (
    <section aria-label="Signaler cette annonce" className="flex max-w-lg flex-col gap-3 rounded-lg border border-border p-4">
      <h2 className="text-base font-medium text-foreground">Signaler cette annonce</h2>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Motif</span>
        <select
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
          value={reason}
          onChange={(e) => setReason(e.target.value as Reason)}
        >
          {Object.entries(CONTENT_REPORT_REASON_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Que se passe-t-il ?</span>
        <Textarea className="min-h-24" value={message} maxLength={3000} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Votre email (facultatif)</span>
        <input
          type="email"
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
          value={email}
          maxLength={255}
          onChange={(e) => setEmail(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">Uniquement pour vous répondre. Il n&apos;est pas transmis au bailleur.</span>
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Envoi…" : "Envoyer le signalement"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Annuler
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
