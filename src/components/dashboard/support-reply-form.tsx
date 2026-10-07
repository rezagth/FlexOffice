"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

/** Answer to a support ticket: stored in the ticket's history and e-mailed
 * to the address the ticket was opened with. */
export function SupportReplyForm({ ticketId, email, isOpen }: { ticketId: string; email: string; isOpen: boolean }) {
  const router = useRouter();
  const fieldId = useId();
  const [body, setBody] = useState("");
  const [close, setClose] = useState(isOpen);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) {
      setError("Écrivez une réponse.");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/support/tickets/${ticketId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), close: isOpen && close }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.issues?.[0]?.message ?? payload?.error?.message ?? "L'envoi a échoué.");
        return;
      }
      setBody("");
      setNotice(
        payload?.emailed
          ? "Réponse enregistrée et envoyée par e-mail."
          : "Réponse enregistrée, mais l'e-mail n'a pas pu partir : contactez le demandeur autrement."
      );
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
        Répondre à {email}
      </label>
      <Textarea
        id={fieldId}
        value={body}
        maxLength={5000}
        onChange={(event) => setBody(event.target.value)}
        aria-invalid={error ? true : undefined}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Envoi…" : "Envoyer la réponse"}
        </Button>
        {isOpen && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={close} onCheckedChange={(value) => setClose(value === true)} />
            Clore le ticket après l&apos;envoi
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </form>
  );
}
