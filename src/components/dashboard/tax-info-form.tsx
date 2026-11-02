"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Props = {
  holderType: "COMPANY" | "INDIVIDUAL";
  initial: { taxResidenceCountry: string; taxIdentificationNumber: string; representativeBirthDate: string };
  canEdit: boolean;
};

/**
 * DAC7 tax identity of the organization. A company that is French may leave
 * the number empty (its SIREN identifies it); an individual must give a number
 * and a birth date. The server decides what is complete (domains/tax-info.ts);
 * this form only collects.
 */
export function TaxInfoForm({ holderType, initial, canEdit }: Props) {
  const router = useRouter();
  const [country, setCountry] = useState(initial.taxResidenceCountry);
  const [tin, setTin] = useState(initial.taxIdentificationNumber);
  const [birthDate, setBirthDate] = useState(initial.representativeBirthDate);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const response = await fetch("/api/landlord/tax-info", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taxResidenceCountry: country,
          taxIdentificationNumber: tin.trim() || undefined,
          representativeBirthDate: holderType === "INDIVIDUAL" && birthDate ? birthDate : undefined,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.issues?.[0]?.message ?? body?.error?.message ?? "L'enregistrement a échoué.");
        setStatus("idle");
        return;
      }
      setStatus("saved");
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={save} className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <Field label="Pays de résidence fiscale" htmlFor="tax-country" hint="Code sur 2 lettres, par exemple FR.">
        <Input id="tax-country" value={country} maxLength={2} disabled={!canEdit} onChange={(e) => setCountry(e.target.value)} />
      </Field>
      <Field
        label="Numéro d'identification fiscale"
        htmlFor="tax-tin"
        hint={
          holderType === "COMPANY"
            ? "Facultatif pour une société française : son SIREN suffit."
            : "Pour un particulier français, c'est le numéro fiscal à 13 chiffres de l'avis d'impôt."
        }
      >
        <Input id="tax-tin" value={tin} maxLength={40} disabled={!canEdit} onChange={(e) => setTin(e.target.value)} />
      </Field>
      {holderType === "INDIVIDUAL" && (
        <Field label="Date de naissance" htmlFor="tax-birth">
          <Input id="tax-birth" type="date" value={birthDate} disabled={!canEdit} onChange={(e) => setBirthDate(e.target.value)} />
        </Field>
      )}
      <div className="flex flex-col gap-2 sm:col-span-2">
        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={status === "saving"}>
              {status === "saving" ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <span role="status" className="text-xs text-muted-foreground">
              {status === "saved" && "Enregistré."}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Seul le propriétaire de l&apos;organisation peut modifier ces informations.</p>
        )}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
