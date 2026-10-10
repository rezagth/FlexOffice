"use client";

import { useState, type FormEvent } from "react";
import { changeEmailSchema, fieldErrors } from "@/lib/validation/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { describedBy, FormField, FormMessage } from "./form-field";
import { formErrorMessage, issuesToFieldErrors } from "./form-errors";

/**
 * E-mail change (FCT-18). Nothing changes until the link sent to the new
 * address is clicked; the message says so.
 */
export function AccountEmailForm({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const parsed = changeEmailSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      document.getElementById("newEmail")?.focus();
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const response = await fetch("/api/account/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const fields = issuesToFieldErrors(body);
        setErrors(fields.email ? { newEmail: fields.email } : {});
        setMessage({ tone: "error", text: formErrorMessage(body, "Le changement d'adresse n'a pas pu être demandé.") });
        return;
      }
      setMessage({ tone: "success", text: body?.message ?? "Un lien de confirmation a été envoyé à la nouvelle adresse." });
      setEmail("");
    } catch {
      setMessage({ tone: "error", text: "Une erreur réseau est survenue. Réessayez." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Adresse actuelle : <span className="font-medium text-foreground">{currentEmail}</span>
      </p>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <FormField id="newEmail" label="Nouvelle adresse e-mail" error={errors.newEmail}>
        <Input
          id="newEmail"
          type="email"
          autoComplete="email"
          required
          aria-invalid={errors.newEmail ? true : undefined}
          aria-describedby={describedBy("newEmail", errors.newEmail)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="self-start">
        {pending ? "Envoi…" : "Changer d'adresse"}
      </Button>
    </form>
  );
}
