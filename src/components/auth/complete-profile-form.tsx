"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { fieldErrors } from "@/lib/validation/auth";
import { completeProfileSchema as schema } from "@/lib/validation/signup-wizard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { describedBy, FormField, FormMessage } from "./form-field";
import { focusFirstError, formErrorMessage, issuesToFieldErrors } from "./form-errors";

/**
 * PRD V1.1, R15/R62 — one page, not a wizard: this is a completion screen
 * for an account that already exists, so it only asks what's actually
 * missing (never `name`/`email`/`password`, already on the account).
 *
 * Company/address fields only show when `!hasOrganization` — an account that
 * already belongs to an organization keeps it (complete-profile.ts never
 * creates a second one), so asking for a SIRET it would just discard would
 * be misleading.
 */

type FormState = {
  need: "SEARCH" | "PUBLISH" | "";
  holderType: "INDIVIDUAL" | "COMPANY" | "";
  activityType: "OWNER" | "OPERATOR" | "";
  isRealEstateProfessional: boolean;
  phone: string;
  legalName: string;
  siret: string;
  siren: string;
  vatNumber: string;
  legalRepresentativeName: string;
  address: string;
  city: string;
  postalCode: string;
};

const ORDER = [
  "need",
  "holderType",
  "activityType",
  "phone",
  "legalName",
  "siret",
  "siren",
  "legalRepresentativeName",
  "vatNumber",
  "address",
  "city",
  "postalCode",
];

function toPayload(form: FormState) {
  const orUndef = (value: string) => (value.trim() ? value.trim() : undefined);
  return {
    need: form.need || undefined,
    holderType: form.holderType || undefined,
    activityType: form.activityType || undefined,
    isRealEstateProfessional: form.isRealEstateProfessional,
    phone: orUndef(form.phone),
    legalName: orUndef(form.legalName),
    siret: orUndef(form.siret),
    siren: orUndef(form.siren),
    vatNumber: orUndef(form.vatNumber),
    legalRepresentativeName: orUndef(form.legalRepresentativeName),
    address: orUndef(form.address),
    city: orUndef(form.city),
    postalCode: orUndef(form.postalCode),
  };
}

export function CompleteProfileForm({
  initialNeed,
  initialHolderType,
  initialPhone,
  hasOrganization,
  backHref,
}: {
  initialNeed: "SEARCH" | "PUBLISH" | "";
  initialHolderType: "INDIVIDUAL" | "COMPANY" | "";
  initialPhone: string;
  hasOrganization: boolean;
  backHref: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    need: initialNeed,
    holderType: initialHolderType,
    activityType: "",
    isRealEstateProfessional: false,
    phone: initialPhone,
    legalName: "",
    siret: "",
    siren: "",
    vatNumber: "",
    legalRepresentativeName: "",
    address: "",
    city: "",
    postalCode: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [organizationFailedReason, setOrganizationFailedReason] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function fieldProps(key: keyof FormState, hint?: string) {
    return {
      id: key,
      value: form[key] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => update(key, e.target.value as FormState[typeof key]),
      "aria-invalid": errors[key] ? true : undefined,
      "aria-describedby": describedBy(key, errors[key], hint),
    };
  }

  const showCompanyFields = form.holderType === "COMPANY" && !hasOrganization;
  const showAddressFields = !hasOrganization && (form.need === "PUBLISH" || form.holderType === "COMPANY");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = schema.safeParse(toPayload(form));
    if (!result.success) {
      const all = fieldErrors(result.error);
      setErrors(all);
      focusFirstError(all, ORDER);
      return;
    }
    setErrors({});

    setPending(true);
    let response: Response;
    try {
      response = await fetch("/api/account/complete-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
    } catch {
      setPending(false);
      setFormError("Une erreur réseau est survenue. Réessayez.");
      return;
    }
    setPending(false);

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setErrors(issuesToFieldErrors(body));
      setFormError(formErrorMessage(body, "Vos informations n'ont pas pu être enregistrées."));
      return;
    }

    if (body?.organizationFailedReason) {
      setOrganizationFailedReason(body.organizationFailedReason as string);
      return;
    }

    router.push(backHref || "/app/account");
    router.refresh();
  }

  if (organizationFailedReason) {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage tone="success">Votre profil a été enregistré.</FormMessage>
        <FormMessage tone="error">{organizationFailedReason}</FormMessage>
        <Link href="/app/account" className="font-medium text-primary underline underline-offset-2">
          Retour à mon compte
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {formError && <FormMessage tone="error">{formError}</FormMessage>}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">Que souhaitez-vous faire ?</legend>
        <div role="radiogroup" aria-label="Besoin" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { value: "SEARCH" as const, label: "Je cherche un espace" },
            { value: "PUBLISH" as const, label: "Je publie un espace" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={form.need === option.value}
              onClick={() => update("need", option.value)}
              className={clsx(
                "rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
                form.need === option.value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {errors.need && <p className="text-xs text-danger">{errors.need}</p>}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">Vous êtes…</legend>
        <div role="radiogroup" aria-label="Profil" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { value: "INDIVIDUAL" as const, label: "Un particulier" },
            { value: "COMPANY" as const, label: "Une société" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={form.holderType === option.value}
              onClick={() => update("holderType", option.value)}
              className={clsx(
                "rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
                form.holderType === option.value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {errors.holderType && <p className="text-xs text-danger">{errors.holderType}</p>}
      </fieldset>

      {form.need === "PUBLISH" && !hasOrganization && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-foreground">Pour cet espace, vous êtes…</legend>
          <div role="radiogroup" aria-label="Activité" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { value: "OWNER" as const, label: "Propriétaire" },
              { value: "OPERATOR" as const, label: "Exploitant (sous-location autorisée)" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={form.activityType === option.value}
                onClick={() => update("activityType", option.value)}
                className={clsx(
                  "rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
                  form.activityType === option.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {errors.activityType && <p className="text-xs text-danger">{errors.activityType}</p>}

          {form.holderType === "COMPANY" && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={form.isRealEstateProfessional}
                onCheckedChange={(checked) => update("isRealEstateProfessional", checked === true)}
              />
              Agence immobilière, foncière ou conciergerie (carte professionnelle)
            </label>
          )}
        </fieldset>
      )}

      <FormField id="phone" label="Téléphone" error={errors.phone}>
        <Input type="tel" autoComplete="tel" required {...fieldProps("phone")} />
      </FormField>

      {showCompanyFields && (
        <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
          <p className="text-sm font-medium text-foreground">Votre entreprise</p>
          <FormField id="legalName" label="Raison sociale" error={errors.legalName}>
            <Input required {...fieldProps("legalName")} />
          </FormField>
          <FormField id="siret" label="SIRET" error={errors.siret} hint="14 chiffres">
            <Input required inputMode="numeric" {...fieldProps("siret", "14 chiffres")} />
          </FormField>
          <FormField id="legalRepresentativeName" label="Représentant légal" error={errors.legalRepresentativeName}>
            <Input required {...fieldProps("legalRepresentativeName")} />
          </FormField>
          <FormField id="vatNumber" label="N° TVA intracommunautaire (optionnel)" error={errors.vatNumber}>
            <Input {...fieldProps("vatNumber")} />
          </FormField>
        </div>
      )}

      {showAddressFields && (
        <div className="flex flex-col gap-4">
          <FormField id="address" label="Adresse" error={errors.address}>
            <Input required {...fieldProps("address")} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="city" label="Ville" error={errors.city}>
              <Input required {...fieldProps("city")} />
            </FormField>
            <FormField id="postalCode" label="Code postal" error={errors.postalCode}>
              <Input required inputMode="numeric" {...fieldProps("postalCode")} />
            </FormField>
          </div>
        </div>
      )}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
