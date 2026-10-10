"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  /** API route to POST to. */
  url: string;
  label: string;
  /** Label of the confirmation button, e.g. "Confirmer la suspension". */
  confirmLabel: string;
  variant?: ButtonVariant;
  /** "required": a reason is mandatory (sent as { reason }); "optional":
   * the field is shown but may stay empty; "none": confirmation only. */
  reason?: "required" | "optional" | "none";
  reasonLabel?: string;
  /** Says where the reason goes. */
  reasonHint?: string;
  /** One sentence shown in the confirmation step. */
  warning?: string;
};

/**
 * A back-office action with a confirmation step — every action here changes
 * someone else's account or listing, so none fires on a single click. When
 * a reason is collected it is e-mailed to the person affected and kept in
 * the audit log, which the hint under the field says.
 */
export function AdminActionButton({
  url,
  label,
  confirmLabel,
  variant = "outline",
  reason = "none",
  reasonLabel = "Motif",
  reasonHint = "Ce motif est transmis par e-mail à la personne concernée.",
  warning,
}: Props) {
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (reason === "required" && text.trim().length < 3) {
      setError("Indiquez un motif (3 caractères minimum).");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reason === "none" ? {} : { reason: text.trim() || undefined }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.issues?.[0]?.message ?? body?.error?.message ?? "L'action a échoué.");
        return;
      }
      setOpen(false);
      setText("");
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-2 rounded-lg border border-border bg-card p-3">
      {warning && <p className="text-xs text-muted-foreground">{warning}</p>}
      {reason !== "none" && (
        <div className="flex flex-col gap-1">
          <label htmlFor={fieldId} className="text-xs font-medium text-foreground">
            {reasonLabel}
            {reason === "optional" ? " (facultatif)" : ""}
          </label>
          <Textarea
            id={fieldId}
            className="min-h-20"
            value={text}
            maxLength={1000}
            onChange={(event) => setText(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${fieldId}-hint`}
          />
          <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
            {reasonHint}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "…" : confirmLabel}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={pending}
        >
          Annuler
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
