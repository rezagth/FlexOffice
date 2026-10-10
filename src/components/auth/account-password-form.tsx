"use client";

import { useState, type FormEvent } from "react";
import { PASSWORD_MIN_LENGTH, passwordSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { describedBy, FormField, FormMessage } from "./form-field";
import { formErrorMessage, issuesToFieldErrors } from "./form-errors";
import { PasswordInput } from "./password-input";

const HINT = `${PASSWORD_MIN_LENGTH} caractères minimum`;

/** Password change from the account page: the current password is
 * required and re-verified server-side (FCT-18). */
export function AccountPasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const next: Record<string, string> = {};
    if (!currentPassword) next.currentPassword = "Mot de passe actuel requis.";
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) next.newPassword = parsed.error.issues[0]?.message ?? "Mot de passe invalide.";
    setErrors(next);
    if (next.currentPassword || next.newPassword) {
      document.getElementById(next.currentPassword ? "currentPassword" : "newPassword")?.focus();
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/auth/password/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, password }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (body?.error?.code === "INVALID_PASSWORD") {
          setErrors({ currentPassword: "Mot de passe actuel incorrect." });
          document.getElementById("currentPassword")?.focus();
          return;
        }
        const fields = issuesToFieldErrors(body);
        setErrors(fields.password ? { newPassword: fields.password } : {});
        setMessage({ tone: "error", text: formErrorMessage(body, "Le mot de passe n'a pas pu être modifié.") });
        return;
      }
      setMessage({
        tone: "success",
        text: "Votre mot de passe a été modifié. Vos autres sessions ont été déconnectées.",
      });
      setCurrentPassword("");
      setPassword("");
    } catch {
      setMessage({ tone: "error", text: "Une erreur réseau est survenue. Réessayez." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <FormField id="currentPassword" label="Mot de passe actuel" error={errors.currentPassword}>
        <PasswordInput
          id="currentPassword"
          autoComplete="current-password"
          required
          aria-invalid={errors.currentPassword ? true : undefined}
          aria-describedby={describedBy("currentPassword", errors.currentPassword)}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </FormField>
      <FormField id="newPassword" label="Nouveau mot de passe" error={errors.newPassword} hint={HINT}>
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          required
          aria-invalid={errors.newPassword ? true : undefined}
          aria-describedby={describedBy("newPassword", errors.newPassword, HINT)}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="self-start">
        {pending ? "Enregistrement…" : "Changer le mot de passe"}
      </Button>
    </form>
  );
}
