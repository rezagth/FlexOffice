"use client";

import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";

export function PayoutFrequencyForm({
  initialFrequency,
  canEdit,
}: {
  initialFrequency: "WEEKLY" | "MONTHLY";
  canEdit: boolean;
}) {
  const [frequency, setFrequency] = useState(initialFrequency);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function change(next: "WEEKLY" | "MONTHLY") {
    const previous = frequency;
    setFrequency(next);
    setStatus("saving");
    try {
      const response = await fetch("/api/landlord/payouts/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ frequency: next }),
      });
      if (!response.ok) throw new Error("save failed");
      setStatus("saved");
    } catch {
      setFrequency(previous);
      setStatus("error");
    }
  }

  return (
    <Field
      label="Fréquence des versements"
      htmlFor="payout-frequency"
      hint={
        canEdit
          ? "Vous êtes payé le lundi (chaque semaine) ou le 1er du mois, pour les séjours terminés."
          : "Seul le propriétaire de l'organisation peut modifier cette fréquence."
      }
    >
      <Select
        id="payout-frequency"
        value={frequency}
        disabled={!canEdit || status === "saving"}
        onChange={(event) => change(event.target.value as "WEEKLY" | "MONTHLY")}
      >
        <option value="MONTHLY">Chaque début de mois</option>
        <option value="WEEKLY">Chaque début de semaine</option>
      </Select>
      <span role="status" className="text-xs text-muted-foreground">
        {status === "saved" && "Enregistré."}
        {status === "error" && "L'enregistrement a échoué. Réessayez."}
      </span>
    </Field>
  );
}
