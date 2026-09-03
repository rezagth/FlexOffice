"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Saveable draft, editable, validated server-side (length) — nothing more.
 * Not shown anywhere public yet: there is no Listing to display it on. */
export function PropertyDescriptionForm({
  propertyId,
  initialDescription,
}: {
  propertyId: string;
  initialDescription: string;
}) {
  const router = useRouter();
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/properties/${propertyId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description }),
    });
    setSaving(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "L'enregistrement a échoué.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        aria-label="Description du bien"
        maxLength={4000}
        rows={4}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Décrivez ce bien : ambiance, quartier, points forts…"
      />
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <Button type="button" size="sm" className="self-start" disabled={saving} onClick={handleSave}>
        {saving ? "Enregistrement…" : "Enregistrer la description"}
      </Button>
    </div>
  );
}
