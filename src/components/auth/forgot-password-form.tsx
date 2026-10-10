"use client";

import { useState, type FormEvent } from "react";
import { fieldErrors, forgotPasswordSchema } from "@/lib/validation/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { describedBy, FormField, FormMessage } from "./form-field";
import { formErrorMessage } from "./form-errors";

/**
 * "Mot de passe oublié" (B-15). Whatever the server answers on success is
 * shown as-is: it is the same neutral sentence for every address.
 */
export function ForgotPasswordForm({ notice }: { notice?: string }) {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      document.getElementById("email")?.focus();
      return;
    }
    setErrors({});

    setPending(true);
    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setFormError(formErrorMessage(body, "La demande n'a pas pu être envoyée. Réessayez."));
        return;
      }
      setSent(body?.message ?? "Si un compte existe avec cette adresse, vous allez recevoir un e-mail.");
    } catch {
      setFormError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  if (sent) return <FormMessage tone="success">{sent}</FormMessage>;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {notice && !formError && <FormMessage tone="info">{notice}</FormMessage>}
      {formError && <FormMessage tone="error">{formError}</FormMessage>}
      <FormField id="email" label="Email" error={errors.email}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy("email", errors.email)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Envoi…" : "Recevoir un lien"}
      </Button>
    </form>
  );
}
