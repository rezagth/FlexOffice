"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { describedBy, FormField, FormMessage } from "./form-field";
import { formErrorMessage } from "./form-errors";
import { PasswordInput } from "./password-input";

/**
 * GDPR export and erasure (SEC-10, FCT-19). Erasure asks for the current
 * password — checked server-side — and the server refuses it (409) while a
 * booking is still pending or confirmed; that message is shown as-is.
 *
 * Replaces components/dashboard/gdpr-actions.tsx, which posted with no
 * re-authentication.
 */
export function AccountDataActions() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!password) {
      setFieldError("Mot de passe requis.");
      document.getElementById("deletePassword")?.focus();
      return;
    }
    setFieldError(null);
    setPending(true);
    try {
      const response = await fetch("/api/client/gdpr/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (body?.error?.code === "INVALID_PASSWORD") {
          setFieldError("Mot de passe incorrect.");
          document.getElementById("deletePassword")?.focus();
          return;
        }
        setError(formErrorMessage(body, "La suppression a échoué. Réessayez."));
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Exporter mes données</p>
        <p className="text-sm text-muted-foreground">
          Téléchargez l&apos;ensemble des données que nous conservons sur votre compte
          (profil, réservations, messages, demandes au support, litiges, dossiers de
          vérification), au format JSON.
        </p>
        <div>
          <ButtonLink href="/api/client/gdpr/export" variant="outline" size="sm" prefetch={false}>
            Télécharger mes données
          </ButtonLink>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <p className="text-sm font-medium">Supprimer mon compte</p>
        <p className="text-sm text-muted-foreground">
          Cette action est définitive. Elle n&apos;est pas possible tant qu&apos;une
          réservation est en attente ou à venir. Si vous avez déjà réservé un espace,
          vos réservations sont conservées pour des raisons comptables, mais vos
          données personnelles en sont détachées.
        </p>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {confirming ? (
          <form onSubmit={deleteAccount} noValidate className="flex flex-col gap-3">
            <FormField
              id="deletePassword"
              label="Confirmez avec votre mot de passe"
              error={fieldError ?? undefined}
            >
              <PasswordInput
                id="deletePassword"
                autoComplete="current-password"
                required
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={describedBy("deletePassword", fieldError ?? undefined)}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Suppression…" : "Supprimer définitivement"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setConfirming(false);
                  setPassword("");
                  setFieldError(null);
                }}
                disabled={pending}
              >
                Annuler
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
              Supprimer mon compte
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
