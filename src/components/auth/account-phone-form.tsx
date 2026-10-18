"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { describedBy, FormField, FormMessage } from "./form-field";
import { formErrorMessage, issuesToFieldErrors } from "./form-errors";

/**
 * PRD V1.1, 2B — the one place `phone`/`phoneVerifiedAt` can change, used
 * from both "Mon compte" and `/app/complete-profile` (same component, not
 * duplicated): a plain-text phone field doesn't exist anywhere any more.
 *
 * Two flows, chosen by the server from the account's own state, not by this
 * component: INITIAL_VERIFICATION (no verified phone yet — the code goes to
 * the number just entered) and NUMBER_CHANGE (already verified — the code
 * goes to the CURRENT number, and the new one is applied directly on
 * success, R51). This component only ever asks for the number once and
 * then the code; it doesn't need to know which flow applies.
 */
export function AccountPhoneForm({
  phone,
  phoneVerifiedAt,
}: {
  phone: string | null;
  phoneVerifiedAt: string | null;
}) {
  const router = useRouter();
  const verified = Boolean(phoneVerifiedAt);
  const [editing, setEditing] = useState(!phone);
  const [newPhone, setNewPhone] = useState(verified ? "" : (phone ?? ""));
  const [code, setCode] = useState("");
  const [sentToMasked, setSentToMasked] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setErrors({});
    setPending(true);
    try {
      const response = await fetch("/api/account/phone/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPhone }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setErrors(issuesToFieldErrors(body));
        setMessage({ tone: "error", text: formErrorMessage(body, "Le code n'a pas pu être envoyé.") });
        return;
      }
      setSentToMasked(body?.sentToMasked ?? null);
      setMessage({ tone: "info", text: `Un code a été envoyé au ${body?.sentToMasked ?? "numéro concerné"}.` });
    } catch {
      setMessage({ tone: "error", text: "Une erreur réseau est survenue. Réessayez." });
    } finally {
      setPending(false);
    }
  }

  async function confirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setErrors({});
    setPending(true);
    try {
      const response = await fetch("/api/account/phone/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setErrors(issuesToFieldErrors(body));
        setMessage({ tone: "error", text: formErrorMessage(body, "Le code n'a pas pu être vérifié.") });
        return;
      }
      setMessage({ tone: "success", text: "Numéro vérifié." });
      setSentToMasked(null);
      setEditing(false);
      setCode("");
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Une erreur réseau est survenue. Réessayez." });
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        <dl className="flex items-center justify-between gap-4 text-sm">
          <dt className="text-muted-foreground">Téléphone</dt>
          <dd className="font-medium">
            {phone} <span className="text-xs text-primary">— vérifié</span>
          </dd>
        </dl>
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setEditing(true)}>
          Changer de numéro
        </Button>
      </div>
    );
  }

  if (sentToMasked) {
    return (
      <form onSubmit={confirmCode} noValidate className="flex flex-col gap-4">
        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        <FormField id="phone-code" label="Code reçu par SMS" error={errors.code} hint="6 chiffres">
          <Input
            id="phone-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={!!errors.code}
            aria-describedby={describedBy("phone-code", errors.code, "6 chiffres")}
          />
        </FormField>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Vérification…" : "Valider"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSentToMasked(null)} disabled={pending}>
            Annuler
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} noValidate className="flex flex-col gap-4">
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <FormField id="phone-new" label={verified ? "Nouveau numéro" : "Téléphone"} error={errors.newPhone}>
        <Input
          id="phone-new"
          type="tel"
          autoComplete="tel"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          aria-invalid={!!errors.newPhone}
          aria-describedby={describedBy("phone-new", errors.newPhone)}
        />
      </FormField>
      {verified && (
        <p className="text-xs text-muted-foreground">
          Un code sera envoyé à votre numéro actuel ({phone}) pour confirmer ce changement.
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Envoi…" : "Envoyer le code"}
        </Button>
        {verified && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}
