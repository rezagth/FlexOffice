"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PASSWORD_MIN_LENGTH, passwordSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { describedBy, FormField, FormMessage } from "./form-field";
import { formErrorMessage, issuesToFieldErrors } from "./form-errors";
import { PasswordInput } from "./password-input";

const HINT = `${PASSWORD_MIN_LENGTH} caractères minimum`;

/**
 * "Nouveau mot de passe" (B-15), reached through /auth/confirm with a
 * recovery session. Sends the new password only: the server accepts that
 * because the session was opened by the reset link (users/password.ts).
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const next: Record<string, string> = {};
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) next.password = parsed.error.issues[0]?.message ?? "Mot de passe invalide.";
    else if (password !== confirm) next.confirm = "Les deux mots de passe ne correspondent pas.";
    setErrors(next);
    if (next.password || next.confirm) {
      document.getElementById(next.password ? "password" : "confirm")?.focus();
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/auth/password/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setErrors(issuesToFieldErrors(body));
        setFormError(
          response.status === 401 || response.status === 403
            ? "Ce lien de réinitialisation n'est plus valide. Demandez-en un nouveau."
            : formErrorMessage(body, "Le mot de passe n'a pas pu être modifié. Réessayez.")
        );
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setFormError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage tone="success">Votre mot de passe a été modifié. Vous êtes connecté.</FormMessage>
        <Button onClick={() => router.push("/post-login")}>Continuer</Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && <FormMessage tone="error">{formError}</FormMessage>}
      <FormField id="password" label="Nouveau mot de passe" error={errors.password} hint={HINT}>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          required
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={describedBy("password", errors.password, HINT)}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      <FormField id="confirm" label="Confirmez le mot de passe" error={errors.confirm}>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          required
          aria-invalid={errors.confirm ? true : undefined}
          aria-describedby={describedBy("confirm", errors.confirm)}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </FormField>
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </Button>
    </form>
  );
}
