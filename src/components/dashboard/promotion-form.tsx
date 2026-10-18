"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormMessage } from "@/components/auth/form-field";

export type PromotionFormValues = {
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountPercent: string;
  discountAmount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  spaceIds: string[];
};

export const EMPTY_PROMOTION_FORM: PromotionFormValues = {
  discountType: "PERCENTAGE",
  discountPercent: "",
  discountAmount: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  spaceIds: [],
};

/** Euros (as typed in the form) to integer cents — same helper pattern as
 * space-form.tsx's toCents(). */
function toCents(value: string): number {
  const normalized = value.replace(",", ".").trim();
  return Math.round(Number.parseFloat(normalized || "0") * 100);
}

export function PromotionForm({
  spaces,
  initialValues = EMPTY_PROMOTION_FORM,
  promotionId,
  canSubmitForReview = false,
}: {
  spaces: { id: string; name: string }[];
  initialValues?: PromotionFormValues;
  /** Present when editing an existing promotion. */
  promotionId?: string;
  /** Shows a second "Soumettre" action alongside "Enregistrer" — only
   * meaningful for a DRAFT or REJECTED promotion. */
  canSubmitForReview?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function set<K extends keyof PromotionFormValues>(key: K) {
    return (value: PromotionFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  }

  function toggleSpace(spaceId: string) {
    setValues((v) => ({
      ...v,
      spaceIds: v.spaceIds.includes(spaceId) ? v.spaceIds.filter((id) => id !== spaceId) : [...v.spaceIds, spaceId],
    }));
  }

  function buildPayload() {
    return {
      discountType: values.discountType,
      ...(values.discountType === "PERCENTAGE"
        ? { discountPercent: Number(values.discountPercent) }
        : { discountAmountCents: toCents(values.discountAmount) }),
      startsAt: values.startsAt,
      endsAt: values.endsAt || null,
      usageLimit: values.usageLimit === "" ? null : Number(values.usageLimit),
      spaceIds: values.spaceIds,
    };
  }

  async function save(andSubmit: boolean) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        promotionId ? `/api/landlord/promotions/${promotionId}` : "/api/landlord/promotions",
        {
          method: promotionId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "La promotion n'a pas pu être enregistrée.");
        return;
      }
      const body = await response.json();
      const id: string = body.promotion.id;

      if (andSubmit) {
        const submitResponse = await fetch(`/api/landlord/promotions/${id}/submit`, { method: "POST" });
        if (!submitResponse.ok) {
          setError("Enregistrée, mais la soumission a échoué. Réessayez depuis la liste.");
          return;
        }
      }

      setNotice(andSubmit ? "Promotion soumise pour validation." : "Promotion enregistrée.");
      router.push("/app/landlord/promotions");
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
    >
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {notice && <FormMessage tone="success">{notice}</FormMessage>}

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Remise</h2>
        <Field label="Type de remise" htmlFor="discountType">
          <Select
            id="discountType"
            value={values.discountType}
            onChange={(e) => set("discountType")(e.target.value as PromotionFormValues["discountType"])}
          >
            <option value="PERCENTAGE">Pourcentage</option>
            <option value="FIXED_AMOUNT">Montant fixe</option>
          </Select>
        </Field>
        {values.discountType === "PERCENTAGE" ? (
          <Field label="Remise (%)" htmlFor="discountPercent" hint="Entre 1 et 90 %.">
            <Input
              id="discountPercent"
              type="number"
              min={1}
              max={90}
              required
              value={values.discountPercent}
              onChange={(e) => set("discountPercent")(e.target.value)}
            />
          </Field>
        ) : (
          <Field label="Montant de la remise (€)" htmlFor="discountAmount">
            <Input
              id="discountAmount"
              inputMode="decimal"
              required
              value={values.discountAmount}
              onChange={(e) => set("discountAmount")(e.target.value)}
            />
          </Field>
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Période et plafond</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date de début" htmlFor="startsAt">
            <Input
              id="startsAt"
              type="date"
              required
              value={values.startsAt}
              onChange={(e) => set("startsAt")(e.target.value)}
            />
          </Field>
          <Field label="Date de fin" htmlFor="endsAt" hint="Optionnel : laisser vide pour une promotion sans date de fin.">
            <Input id="endsAt" type="date" value={values.endsAt} onChange={(e) => set("endsAt")(e.target.value)} />
          </Field>
        </div>
        <Field
          label="Plafond d'utilisation"
          htmlFor="usageLimit"
          hint="Nombre maximal de réservations à ce tarif. Optionnel : laisser vide pour aucun plafond."
        >
          <Input
            id="usageLimit"
            type="number"
            min={1}
            value={values.usageLimit}
            onChange={(e) => set("usageLimit")(e.target.value)}
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-medium">Espaces concernés</h2>
        {spaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">Créez d&apos;abord un espace pour pouvoir le mettre en promotion.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {spaces.map((space) => (
              <label key={space.id} className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={values.spaceIds.includes(space.id)} onCheckedChange={() => toggleSpace(space.id)} />
                {space.name}
              </label>
            ))}
          </div>
        )}
      </Card>

      <p className="text-sm text-muted-foreground">
        Une promotion ne s&apos;applique qu&apos;une fois validée par l&apos;équipe MakomSpace. Toute
        modification d&apos;une promotion déjà publiée ou refusée la renvoie en attente de validation.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving || spaces.length === 0}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {canSubmitForReview && (
          <Button type="button" variant="outline" disabled={saving} onClick={() => save(true)}>
            Enregistrer et soumettre
          </Button>
        )}
      </div>
    </form>
  );
}
