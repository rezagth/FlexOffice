"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { registerSchema, type RegisterInput } from "@/lib/validation/auth";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

export function RegisterForm() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("CLIENT");
  const [form, setForm] = useState(emptyForm);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const payload: RegisterInput =
      role === "CLIENT"
        ? {
            role: "CLIENT",
            email: form.email,
            password: form.password,
            name: form.name,
            phone: form.phone || undefined,
          }
        : {
            role: "PARTNER",
            email: form.email,
            password: form.password,
            name: form.name,
            phone: form.phone || undefined,
            organizationName: form.organizationName,
            organizationSiret: form.organizationSiret,
            organizationAddress: form.organizationAddress,
            organizationCity: form.organizationCity,
            organizationPostalCode: form.organizationPostalCode,
          };

    const parsed = registerSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Formulaire invalide.");
      return;
    }

    setPending(true);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    setPending(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setFormError(body?.error?.message ?? "L'inscription a échoué. Merci de réessayer.");
      return;
    }

    const body = await response.json();
    if (body.emailConfirmationRequired) {
      setConfirmationPending(true);
      return;
    }

    router.push("/post-login");
    router.refresh();
  }

  if (confirmationPending) {
    return (
      <p className="rounded-lg bg-muted px-4 py-3 text-sm text-foreground">
        Compte créé ! Vérifiez votre boîte mail pour confirmer votre adresse avant
        de vous connecter.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="Type de compte" className="grid grid-cols-2 gap-2">
        {(
          [
            { value: "CLIENT" as const, label: "Je cherche un espace" },
            { value: "PARTNER" as const, label: "Je publie un espace" },
          ]
        ).map((option) => (
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

      {formError && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}

      <Field label="Nom complet" htmlFor="name">
        <Input
          id="name"
          required
          autoComplete="name"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
        />
      </Field>
      <Field label="Mot de passe" htmlFor="password" hint="8 caractères minimum">
        <Input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
        />
      </Field>
      <Field label="Téléphone (optionnel)" htmlFor="phone">
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
        />
      </Field>

      {role === "PARTNER" && (
        <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
          <p className="text-sm font-medium text-foreground">Votre entreprise</p>
          <Field label="Raison sociale" htmlFor="organizationName">
            <Input
              id="organizationName"
              required
              value={form.organizationName}
              onChange={(e) => update("organizationName", e.target.value)}
            />
          </Field>
          <Field label="SIRET" htmlFor="organizationSiret" hint="14 chiffres">
            <Input
              id="organizationSiret"
              required
              inputMode="numeric"
              value={form.organizationSiret}
              onChange={(e) => update("organizationSiret", e.target.value)}
            />
          </Field>
          <Field label="Adresse" htmlFor="organizationAddress">
            <Input
              id="organizationAddress"
              required
              value={form.organizationAddress}
              onChange={(e) => update("organizationAddress", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ville" htmlFor="organizationCity">
              <Input
                id="organizationCity"
                required
                value={form.organizationCity}
                onChange={(e) => update("organizationCity", e.target.value)}
              />
            </Field>
            <Field label="Code postal" htmlFor="organizationPostalCode">
              <Input
                id="organizationPostalCode"
                required
                inputMode="numeric"
                value={form.organizationPostalCode}
                onChange={(e) => update("organizationPostalCode", e.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Votre entreprise sera vérifiée par notre équipe avant la publication de
            vos espaces.
          </p>
        </div>
      )}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Création du compte…" : "Créer mon compte"}
      </Button>
    </form>
  );
}
