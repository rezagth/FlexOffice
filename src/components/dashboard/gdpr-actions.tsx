"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export function GdprActions() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/client/gdpr/delete", { method: "POST" });
      if (!response.ok) {
        const body = await response.json();
        setError(body?.error?.message ?? "La suppression a échoué.");
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
          Téléchargez l&apos;ensemble des données que nous conservons sur votre
          compte, au format JSON.
        </p>
        <div>
          <ButtonLink href="/api/client/gdpr/export" variant="outline" size="sm" prefetch={false}>
            Télécharger mes données
          </ButtonLink>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-sm font-medium">Supprimer mon compte</p>
        <p className="text-sm text-muted-foreground">
          Cette action est définitive. Si vous avez déjà réservé un espace, vos
          réservations sont conservées pour des raisons comptables, mais vos
          données personnelles en sont détachées.
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {confirming ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={deleteAccount} disabled={pending}>
              {pending ? "Suppression…" : "Confirmer la suppression"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Annuler
            </Button>
          </div>
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
