"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { fieldErrors } from "@/lib/validation/auth";
import { signupWizardSchema as schema } from "@/lib/validation/signup-wizard";
import {
  loadSignupWizardDraft,
  saveSignupWizardDraft,
  clearSignupWizardDraft,
  type WizardDraft,
} from "@/lib/signup-wizard-storage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { describedBy, FormField, FormMessage } from "./form-field";
import { focusFirstError, formErrorMessage, issuesToFieldErrors } from "./form-errors";
import { PasswordInput } from "./password-input";

/**
 * PRD V1.1, R15-R21, R44-R46 — the paged signup wizard: besoin → profil →
 * informations → compte. Replaces the single-page "je cherche / je publie"
 * toggle (register-form.tsx, kept for now behind /api/auth/register — not
 * routed to from the UI any more).
 *
 * The domiciliation page (PRD page 4) is NOT built here — out of this lot;
 * see register-wizard.ts's doc comment for how an organization is still
 * created correctly without it.
 */

type FormState = {
  need: "SEARCH" | "PUBLISH" | "";
  holderType: "INDIVIDUAL" | "COMPANY" | "";
  activityType: "OWNER" | "OPERATOR" | "";
  isRealEstateProfessional: boolean;
  name: string;
  phone: string;
  legalName: string;
  siret: string;
  siren: string;
  vatNumber: string;
  legalRepresentativeName: string;
  address: string;
  city: string;
  postalCode: string;
  email: string;
  password: string;
  acceptTerms: boolean;
};

const EMPTY_FORM: FormState = {
  need: "",
  holderType: "",
  activityType: "",
  isRealEstateProfessional: false,
  name: "",
  phone: "",
  legalName: "",
  siret: "",
  siren: "",
  vatNumber: "",
  legalRepresentativeName: "",
  address: "",
  city: "",
  postalCode: "",
  email: "",
  password: "",
  acceptTerms: false,
};

const STEP_FIELDS = [
  ["need"],
  ["holderType", "activityType", "isRealEstateProfessional"],
  ["name", "phone", "legalName", "siret", "siren", "vatNumber", "legalRepresentativeName", "address", "city", "postalCode"],
  ["email", "password", "acceptTerms"],
] as const;

const STEP_LABELS = ["Besoin", "Profil", "Informations", "Compte"];

/** Never includes `password` (R44) — WizardDraft's type has no such field,
 * so every field here is named explicitly rather than spread from `form`. */
function draftFromForm(form: FormState): WizardDraft {
  return {
    need: form.need || undefined,
    holderType: form.holderType || undefined,
    activityType: form.activityType || undefined,
    isRealEstateProfessional: form.isRealEstateProfessional,
    name: form.name,
    phone: form.phone,
    legalName: form.legalName,
    siret: form.siret,
    siren: form.siren,
    vatNumber: form.vatNumber,
    legalRepresentativeName: form.legalRepresentativeName,
    address: form.address,
    city: form.city,
    postalCode: form.postalCode,
    email: form.email,
    acceptTerms: form.acceptTerms,
  };
}

function formFromDraft(draft: WizardDraft): FormState {
  return {
    ...EMPTY_FORM,
    ...draft,
    need: draft.need ?? "",
    holderType: draft.holderType ?? "",
    activityType: draft.activityType ?? "",
  };
}

/** Builds the payload signupWizardSchema expects — empty strings become
 * `undefined` so the optional/required rules apply the same way whether a
 * field was never shown or was shown and left blank. */
function toPayload(form: FormState) {
  const orUndef = (value: string) => (value.trim() ? value.trim() : undefined);
  return {
    need: form.need || undefined,
    holderType: form.holderType || undefined,
    activityType: form.activityType || undefined,
    isRealEstateProfessional: form.isRealEstateProfessional,
    name: form.name,
    phone: orUndef(form.phone),
    legalName: orUndef(form.legalName),
    siret: orUndef(form.siret),
    siren: orUndef(form.siren),
    vatNumber: orUndef(form.vatNumber),
    legalRepresentativeName: orUndef(form.legalRepresentativeName),
    address: orUndef(form.address),
    city: orUndef(form.city),
    postalCode: orUndef(form.postalCode),
    email: form.email,
    password: form.password,
    acceptTerms: form.acceptTerms,
  };
}

export function SignupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [companyFailedReason, setCompanyFailedReason] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  const restoredOnce = useRef(false);

  useEffect(() => {
    if (restoredOnce.current) return;
    restoredOnce.current = true;
    // One-time sync with an external system (localStorage) right after
    // mount — deliberately not read during render, which would mismatch
    // the server-rendered markup (there is no localStorage during SSR).
    const draft = loadSignupWizardDraft();
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time external-storage sync on mount, not a render-triggered cascade
      setForm(formFromDraft(draft));
      setResumed(true);
    }
  }, []);

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

  function restart() {
    clearSignupWizardDraft();
    setForm(EMPTY_FORM);
    setResumed(false);
    setStep(0);
    setErrors({});
  }

  /** Validates the full answer set, but only surfaces and blocks on errors
   * belonging to the fields a given step actually shows — a later step's
   * unanswered question must not stop someone from reaching it. */
  function validateUpTo(stepIndex: number): boolean {
    const result = schema.safeParse(toPayload(form));
    if (result.success) {
      setErrors({});
      return true;
    }
    const all = fieldErrors(result.error);
    const stepErrors: Record<string, string> = {};
    for (const field of STEP_FIELDS[stepIndex]) {
      if (all[field]) stepErrors[field] = all[field];
    }
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) {
      focusFirstError(stepErrors, [...STEP_FIELDS[stepIndex]]);
      return false;
    }
    return true;
  }

  function goNext() {
    if (!validateUpTo(step)) return;
    saveSignupWizardDraft(draftFromForm(form));
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = schema.safeParse(toPayload(form));
    if (!result.success) {
      const all = fieldErrors(result.error);
      // Jump back to the earliest step that actually has an error.
      const erroringStep = STEP_FIELDS.findIndex((fields) => fields.some((f) => all[f]));
      if (erroringStep >= 0 && erroringStep !== step) {
        setStep(erroringStep);
        setErrors(
          Object.fromEntries(STEP_FIELDS[erroringStep].filter((f) => all[f]).map((f) => [f, all[f]]))
        );
        return;
      }
      setErrors(all);
      focusFirstError(all, [...STEP_FIELDS[step]]);
      return;
    }
    setErrors({});

    setPending(true);
    let response: Response;
    try {
      response = await fetch("/api/auth/register-wizard", {
        method: "POST",
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
      const serverErrors = issuesToFieldErrors(body);
      setErrors(serverErrors);
      setFormError(formErrorMessage(body, "L'inscription a échoué. Merci de réessayer."));
      return;
    }

    clearSignupWizardDraft();

    if (body?.companyFailedReason) {
      setCompanyFailedReason(body.companyFailedReason as string);
      return;
    }
    if (body?.emailConfirmationRequired) {
      setConfirmationPending(true);
      return;
    }

    router.push("/post-login");
    router.refresh();
  }

  if (confirmationPending) {
    return (
      <FormMessage tone="success">
        Merci ! Si cette adresse n&apos;est pas déjà associée à un compte, vous allez
        recevoir un e-mail de confirmation. Cliquez sur le lien qu&apos;il contient pour
        activer votre compte. Vous avez déjà un compte ?{" "}
        <Link href="/login" className="font-medium underline underline-offset-2">
          Connectez-vous
        </Link>{" "}
        ou{" "}
        <Link href="/forgot-password" className="font-medium underline underline-offset-2">
          réinitialisez votre mot de passe
        </Link>
        .
      </FormMessage>
    );
  }

  if (companyFailedReason) {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage tone="success">Votre compte a été créé.</FormMessage>
        <FormMessage tone="error">
          {companyFailedReason} Vous pourrez ajouter votre entreprise depuis votre compte,
          une fois connecté.
        </FormMessage>
        <Link href="/login" className="font-medium text-primary underline underline-offset-2">
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <ol aria-label="Étapes de l'inscription" className="flex items-center gap-2 text-xs">
        {STEP_LABELS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={clsx(
              "flex-1 rounded-full px-2 py-1 text-center font-medium",
              index === step
                ? "bg-primary/10 text-primary"
                : index < step
                  ? "text-foreground"
                  : "text-muted-foreground"
            )}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {resumed && step === 0 && (
        <FormMessage tone="info">
          Reprise de votre inscription précédente.{" "}
          <button type="button" onClick={restart} className="font-medium underline underline-offset-2">
            Recommencer à zéro
          </button>
        </FormMessage>
      )}

      {formError && <FormMessage tone="error">{formError}</FormMessage>}

      {step === 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-foreground">
            Que souhaitez-vous faire ?
          </legend>
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
      )}

      {step === 1 && (
        <div className="flex flex-col gap-5">
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

          {form.need === "PUBLISH" && (
            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-medium text-foreground">
                Pour cet espace, vous êtes…
              </legend>
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
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <FormField id="name" label="Nom complet" error={errors.name}>
            <Input required autoComplete="name" {...fieldProps("name")} />
          </FormField>
          <FormField id="phone" label="Téléphone (optionnel)" error={errors.phone}>
            <Input type="tel" autoComplete="tel" {...fieldProps("phone")} />
          </FormField>

          {form.holderType === "COMPANY" && (
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

          {(form.need === "PUBLISH" || form.holderType === "COMPANY") && (
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

          {form.need === "PUBLISH" && (
            <p className="text-xs text-muted-foreground">
              Votre entreprise sera vérifiée par notre équipe avant la publication de vos
              espaces.
            </p>
          )}
          {form.need === "SEARCH" && form.holderType === "COMPANY" && (
            <p className="text-xs text-muted-foreground">
              Votre entreprise sera vérifiée par notre équipe avant votre première
              réservation en tant que société.
            </p>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <FormField id="email" label="Email" error={errors.email}>
            <Input type="email" required autoComplete="email" {...fieldProps("email")} />
          </FormField>
          <FormField id="password" label="Mot de passe" error={errors.password} hint="8 caractères minimum">
            <PasswordInput
              required
              autoComplete="new-password"
              minLength={8}
              {...fieldProps("password", "8 caractères minimum")}
            />
          </FormField>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-3">
              <input
                id="acceptTerms"
                type="checkbox"
                required
                checked={form.acceptTerms}
                onChange={(e) => update("acceptTerms", e.target.checked)}
                aria-invalid={errors.acceptTerms ? true : undefined}
                aria-describedby={describedBy("acceptTerms", errors.acceptTerms)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
              />
              <Label htmlFor="acceptTerms" className="text-sm text-foreground">
                J&apos;accepte les{" "}
                <Link href="/cgu" target="_blank" className="font-medium text-primary underline underline-offset-2">
                  conditions générales d&apos;utilisation
                </Link>{" "}
                et la{" "}
                <Link
                  href="/confidentialite"
                  target="_blank"
                  className="font-medium text-primary underline underline-offset-2"
                >
                  politique de confidentialité
                </Link>
                .
              </Label>
            </div>
            {errors.acceptTerms && (
              <p id="acceptTerms-error" className="text-xs text-danger">
                {errors.acceptTerms}
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            MakomSpace traite vos données (identité, coordonnées, réservations) pour gérer
            votre compte et vos réservations. Vous pouvez y accéder, les exporter ou les
            supprimer à tout moment depuis votre compte. En savoir plus dans notre{" "}
            <Link href="/confidentialite" className="underline underline-offset-2">
              politique de confidentialité
            </Link>
            .
          </p>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={goBack} disabled={pending}>
            Précédent
          </Button>
        ) : (
          <span />
        )}
        {step < STEP_LABELS.length - 1 ? (
          <Button type="button" onClick={goNext} disabled={pending}>
            Suivant
          </Button>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending ? "Création du compte…" : "Créer mon compte"}
          </Button>
        )}
      </div>
    </form>
  );
}
