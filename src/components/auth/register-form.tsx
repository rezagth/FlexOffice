"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { fieldErrors, registerSchema } from "@/lib/validation/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { describedBy, FormField, FormMessage } from "./form-field";
import { focusFirstError, formErrorMessage, issuesToFieldErrors } from "./form-errors";
import { PasswordInput } from "./password-input";

type Role = "CLIENT" | "PARTNER";

const emptyForm = {
  email: "",
  password: "",
  name: "",
  phone: "",
  organizationName: "",
  organizationSiret: "",
  organizationAddress: "",
  organizationCity: "",
  organizationPostalCode: "",
};

type TextField = keyof typeof emptyForm;

const FIELD_ORDER = [
  "name",
  "email",
  "password",
  "phone",
  "organizationName",
  "organizationSiret",
  "organizationAddress",
  "organizationCity",
  "organizationPostalCode",
  "acceptTerms",
];

export function RegisterForm() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("CLIENT");
  const [form, setForm] = useState(emptyForm);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);

  function update(key: TextField, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Props wiring one text input to its value, error and description. */
  function fieldProps(key: TextField, hint?: string) {
    return {
      id: key,
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => update(key, e.target.value),
      "aria-invalid": errors[key] ? true : undefined,
      "aria-describedby": describedBy(key, errors[key], hint),
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const common = {
      email: form.email,
      password: form.password,
      name: form.name,
      phone: form.phone || undefined,
      acceptTerms,
    };
    const payload =
      role === "CLIENT"
        ? { role, ...common }
        : {
            role,
            ...common,
            organizationName: form.organizationName,
            organizationSiret: form.organizationSiret,
            organizationAddress: form.organizationAddress,
            organizationCity: form.organizationCity,
            organizationPostalCode: form.organizationPostalCode,
          };

    const parsed = registerSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      focusFirstError(next, FIELD_ORDER);
      return;
    }
    setErrors({});

    setPending(true);
    let response: Response;
    try {
      response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
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
      focusFirstError(serverErrors, FIELD_ORDER);
      setFormError(formErrorMessage(body, "L'inscription a échoué. Merci de réessayer."));
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
    // Worded for both cases on purpose (SEC-15): the server gives the same
    // answer whether or not the address already had an account.
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

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="Type de compte" className="grid grid-cols-2 gap-2">
        {[
          { value: "CLIENT" as const, label: "Je cherche un espace" },
          { value: "PARTNER" as const, label: "Je publie un espace" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={role === option.value}
            onClick={() => setRole(option.value)}
            className={clsx(
              "rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
              role === option.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {formError && <FormMessage tone="error">{formError}</FormMessage>}

      <FormField id="name" label="Nom complet" error={errors.name}>
        <Input required autoComplete="name" {...fieldProps("name")} />
      </FormField>
      <FormField id="email" label="Email" error={errors.email}>
        <Input type="email" required autoComplete="email" {...fieldProps("email")} />
      </FormField>
      <FormField id="password" label="Mot de passe" error={errors.password} hint="8 caractères minimum">
        <PasswordInput required autoComplete="new-password" minLength={8} {...fieldProps("password", "8 caractères minimum")} />
      </FormField>
      <FormField id="phone" label="Téléphone (optionnel)" error={errors.phone}>
        <Input type="tel" autoComplete="tel" {...fieldProps("phone")} />
      </FormField>

      {role === "PARTNER" && (
        <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
          <p className="text-sm font-medium text-foreground">Votre entreprise</p>
          <FormField id="organizationName" label="Raison sociale" error={errors.organizationName}>
            <Input required {...fieldProps("organizationName")} />
          </FormField>
          <FormField id="organizationSiret" label="SIRET" error={errors.organizationSiret} hint="14 chiffres">
            <Input required inputMode="numeric" {...fieldProps("organizationSiret", "14 chiffres")} />
          </FormField>
          <FormField id="organizationAddress" label="Adresse" error={errors.organizationAddress}>
            <Input required {...fieldProps("organizationAddress")} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="organizationCity" label="Ville" error={errors.organizationCity}>
              <Input required {...fieldProps("organizationCity")} />
            </FormField>
            <FormField id="organizationPostalCode" label="Code postal" error={errors.organizationPostalCode}>
              <Input required inputMode="numeric" {...fieldProps("organizationPostalCode")} />
            </FormField>
          </div>
          <p className="text-xs text-muted-foreground">
            Votre entreprise sera vérifiée par notre équipe avant la publication de
            vos espaces.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-3">
          <input
            id="acceptTerms"
            type="checkbox"
            required
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            aria-invalid={errors.acceptTerms ? true : undefined}
            aria-describedby={describedBy("acceptTerms", errors.acceptTerms)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
          />
          <label htmlFor="acceptTerms" className="text-sm text-foreground">
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
          </label>
        </div>
        {errors.acceptTerms && (
          <p id="acceptTerms-error" className="text-xs text-danger">
            {errors.acceptTerms}
          </p>
        )}
      </div>

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Création du compte…" : "Créer mon compte"}
      </Button>

      <p className="text-xs text-muted-foreground">
        OfficeFlex traite vos données (identité, coordonnées, réservations) pour gérer
        votre compte et vos réservations. Vous pouvez y accéder, les exporter ou les
        supprimer à tout moment depuis votre compte. En savoir plus dans notre{" "}
        <Link href="/confidentialite" className="underline underline-offset-2">
          politique de confidentialité
        </Link>
        .
      </p>
    </form>
  );
}
