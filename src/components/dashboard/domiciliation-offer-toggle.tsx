"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/auth/form-field";

/**
 * S11 — acting as a domiciliataire is a regulated activity in France
 * (agrément préfectoral). This switch is the one place that offer turns on;
 * the warning is not decorative, it is the one check this codebase can
 * perform — it cannot verify that legal sign-off actually happened.
 */
export function DomiciliationOfferToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    setMessage(null);
    setPending(true);
    try {
      const response = await fetch("/api/admin/domiciliation-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerEnabled: next }),
      });
      if (!response.ok) {
        setMessage("Le réglage n'a pas pu être modifié.");
        return;
      }
      setEnabled(next);
      router.refresh();
    } catch {
      setMessage("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <FormMessage tone="info">
        <strong>Activité réglementée (S11) :</strong> agir comme domiciliataire requiert un agrément
        préfectoral. N&apos;activez cette offre qu&apos;après confirmation d&apos;un juriste que les
        conditions sont remplies — rien dans cette application ne peut le vérifier à votre place.
      </FormMessage>
      {message && <FormMessage tone="error">{message}</FormMessage>}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">
          Offre de domiciliation MakomSpace : {enabled ? "activée" : "désactivée"}
        </span>
        <Button type="button" variant={enabled ? "outline" : "primary"} size="sm" onClick={toggle} disabled={pending}>
          {pending ? "…" : enabled ? "Désactiver" : "Activer"}
        </Button>
      </div>
    </div>
  );
}
