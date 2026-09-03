"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { becomeLandlordSchema } from "@/lib/validation/landlord";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * "Devenir bailleur" — activity type, holder type, and the details that go
 * with them.
 *
 * Three sections on one scrollable page rather than three separate routes:
 * Phase 2 already established this as a single-page form, and a route per
 * step would mean losing everything already typed if a caller navigates back
 * — a numbered progress strip conveys "clear and progressive" without that
 * cost. Documents (step 4) and the recap/submit (step 5) genuinely need
 * their own page: they need a verification id, which this form's own
 * successful submission is what creates. See /app/landlord/verification.
 *
 * Validates with the same Zod schema the route uses, for the error messages,
 * not for the security: the server parses the payload again and every rule
 * that matters (SIRET required for a company, forbidden for an individual)
 * is also a CHECK constraint in the database. A hand-crafted request meets
 * all three.
 *
 * On success it opens the activity, immediately switches to landlord mode —
 * unlocking the capability and choosing to use it are separate acts, but
 * there is no reason to make the caller ask twice — and lands on the
 * verification page rather than the generic home, since uploading documents
 * is the very next thing to do.
 */
type ActivityType = "OWNER" | "OPERATOR";
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
  const [activityType, setActivityType] = useState<ActivityType>("OWNER");
  const [holderType, setHolderType] = useState<HolderType>("INDIVIDUAL");
  const [isRealEstateProfessional, setIsRealEstateProfessional] = useState(false);
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
            activityType,
            displayName: form.displayName || undefined,
            contactEmail: form.contactEmail || undefined,
            address: form.address,
            city: form.city,
            postalCode: form.postalCode,
          }
        : {
            holderType: "COMPANY" as const,
            activityType,
            legalName: form.legalName,
            displayName: form.displayName || undefined,
            siret: form.siret,
            vatNumber: form.vatNumber || undefined,
            legalRepresentativeName: form.legalRepresentativeName,
            isRealEstateProfessional,
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
    // Not /app: uploading the required documents is the immediate next step,
    // and the dossier this form just created is where that happens.
    router.push("/app/landlord/verification");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-lg flex-col gap-6">
      {/* Step 1 — what the caller is here to do. Determines which documents
          the dossier will require (see requirements.ts), so it is asked
          before anything else. */}
      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Étape 1 · Type de bailleur
        </p>
        <p className="text-sm font-medium text-foreground">Que souhaitez-vous faire ?</p>
        <div role="radiogroup" aria-label="Type de bailleur" className="flex flex-col gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={activityType === "OWNER"}
            onClick={() => setActivityType("OWNER")}
            className={clsx(
              "rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
              activityType === "OWNER"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            Publier un bien que je possède
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={activityType === "OPERATOR"}
            onClick={() => setActivityType("OPERATOR")}
            className={clsx(
              "rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
              activityType === "OPERATOR"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            Publier un bien que j&apos;exploite
          </button>
        </div>
        {activityType === "OPERATOR" && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Une autorisation de sous-location vous sera demandée pour prouver
            votre droit d&apos;exploitation.
          </p>
        )}
      </section>

      {/* Step 2 — who holds the activity. */}
      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Étape 2 · Titulaire
        </p>
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
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {/* Step 3 — the details. */}
      <section className="flex flex-col gap-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Étape 3 · Informations
        </p>

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
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={isRealEstateProfessional}
                onChange={(e) => setIsRealEstateProfessional(e.target.checked)}
              />
              <span>
                Agence immobilière / foncière / conciergerie
                <span className="block text-xs text-muted-foreground">
                  Nécessite une carte professionnelle (carte T) en plus des
                  documents ci-dessus.
                </span>
              </span>
            </label>
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
      </section>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Activation…" : "Continuer vers les documents"}
      </Button>
    </form>
  );
}
