"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { becomeLandlordSchema } from "@/lib/validation/landlord";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * "Devenir bailleur" — the holder-type choice and the details that go with it.
 *
 * Validates with the same Zod schema the route uses, for the error messages,
 * not for the security: the server parses the payload again and every rule
 * that matters (SIRET required for a company, forbidden for an individual)
 * is also a CHECK constraint in the database. A hand-crafted request meets
 * all three.
 *
 * On success it opens the activity and immediately switches to landlord mode,
 * so the journey ends where the user expects: in their new space. The two
 * calls are separate on purpose — unlocking the capability and choosing to
 * use it are distinct acts, and the switch goes through the same endpoint any
 * later switch uses rather than a special path.
 */
type HolderType = "INDIVIDUAL" | "COMPANY";

const emptyForm = {
  displayName: "",
  contactEmail: "",
  legalName: "",
  siret: "",
  vatNumber: "",
  legalRepresentativeName: "",
  address: "",
  city: "",
  postalCode: "",
};

export function BecomeLandlordForm() {
  const router = useRouter();
  const [holderType, setHolderType] = useState<HolderType>("INDIVIDUAL");
  const [form, setForm] = useState(emptyForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const payload =
      holderType === "INDIVIDUAL"
        ? {
            holderType: "INDIVIDUAL" as const,
            displayName: form.displayName || undefined,
            contactEmail: form.contactEmail || undefined,
            address: form.address,
            city: form.city,
            postalCode: form.postalCode,
          }
        : {
            holderType: "COMPANY" as const,
            legalName: form.legalName,
            displayName: form.displayName || undefined,
            siret: form.siret,
            vatNumber: form.vatNumber || undefined,
            legalRepresentativeName: form.legalRepresentativeName,
            contactEmail: form.contactEmail || undefined,
            address: form.address,
            city: form.city,
            postalCode: form.postalCode,
          };

    const parsed = becomeLandlordSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Formulaire invalide.");
      return;
    }

    setPending(true);
    const response = await fetch("/api/account/become-landlord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });

    if (!response.ok) {
      setPending(false);
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "L'activation a échoué. Merci de réessayer.");
      return;
    }

    // Land the user in the space they just unlocked. A failure here is not
    // fatal: the activity exists and the switcher in the sidebar works.
    await fetch("/api/account/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "LANDLORD" }),
    }).catch(() => null);

    setPending(false);
    router.push("/app");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-lg flex-col gap-5">
      <div role="radiogroup" aria-label="Type de titulaire" className="grid grid-cols-2 gap-2">
        {(
          [
            { value: "INDIVIDUAL" as const, label: "Particulier" },
            { value: "COMPANY" as const, label: "Société" },
          ]
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={holderType === option.value}
            onClick={() => setHolderType(option.value)}
            className={clsx(
              "rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
              holderType === option.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {holderType === "COMPANY" ? (
        <>
          <Field label="Raison sociale" htmlFor="legalName">
            <Input
              id="legalName"
              required
              value={form.legalName}
              onChange={(e) => update("legalName", e.target.value)}
            />
          </Field>
          <Field label="SIRET" htmlFor="siret" hint="14 chiffres">
            <Input
              id="siret"
              required
              inputMode="numeric"
              value={form.siret}
              onChange={(e) => update("siret", e.target.value)}
            />
          </Field>
          <Field
            label="Numéro de TVA intracommunautaire (optionnel)"
            htmlFor="vatNumber"
          >
            <Input
              id="vatNumber"
              value={form.vatNumber}
              onChange={(e) => update("vatNumber", e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Représentant légal" htmlFor="legalRepresentativeName">
            <Input
              id="legalRepresentativeName"
              required
              value={form.legalRepresentativeName}
              onChange={(e) => update("legalRepresentativeName", e.target.value)}
            />
          </Field>
        </>
      ) : (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Votre identité est déjà rattachée à votre compte. Nous avons
          seulement besoin de l&apos;adresse de votre activité.
        </p>
      )}

      <Field
        label="Nom affiché (optionnel)"
        htmlFor="displayName"
        hint="Le nom que verront les clients"
      >
        <Input
          id="displayName"
          value={form.displayName}
          onChange={(e) => update("displayName", e.target.value)}
        />
      </Field>

      <Field label="Adresse" htmlFor="address">
        <Input
          id="address"
          required
          value={form.address}
          onChange={(e) => update("address", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Ville" htmlFor="city">
          <Input
            id="city"
            required
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
          />
        </Field>
        <Field label="Code postal" htmlFor="postalCode">
          <Input
            id="postalCode"
            required
            inputMode="numeric"
            value={form.postalCode}
            onChange={(e) => update("postalCode", e.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Email de contact (optionnel)"
        htmlFor="contactEmail"
        hint="Par défaut, l'email de votre compte"
      >
        <Input
          id="contactEmail"
          type="email"
          value={form.contactEmail}
          onChange={(e) => update("contactEmail", e.target.value)}
        />
      </Field>

      <Button type="submit" disabled={pending} className="mt-2 self-start">
        {pending ? "Activation…" : "Activer mon activité de bailleur"}
      </Button>
    </form>
  );
}
