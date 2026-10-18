"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fieldErrors } from "@/lib/validation/auth";
import { organizationIdentityFieldsSchema } from "@/lib/validation/landlord";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { describedBy, FormField, FormMessage } from "./form-field";
import { focusFirstError, formErrorMessage, issuesToFieldErrors } from "./form-errors";

const ORDER = ["legalName", "siret"];
const SIRET_HINT = "Modifier le SIRET ou la raison sociale d'une entreprise déjà vérifiée la renvoie en vérification.";

/**
 * PRD V1.1, R81 — editing a COMPANY-holder organization's legal identity
 * from "Mon compte". Only rendered by the page for a caller whose orgRole
 * is OWNER or ADMIN; the PATCH route re-checks that membership itself
 * rather than trusting this gate.
 */
export function AccountOrganizationForm({
  organizationId,
  initialLegalName,
  initialSiret,
}: {
  organizationId: string;
  initialLegalName: string;
  initialSiret: string;
}) {
  const router = useRouter();
  const [legalName, setLegalName] = useState(initialLegalName);
  const [siret, setSiret] = useState(initialSiret);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const parsed = organizationIdentityFieldsSchema.safeParse({ legalName, siret });
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      focusFirstError(next, ORDER);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const response = await fetch("/api/account/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, legalName, siret }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setErrors(issuesToFieldErrors(body));
        setMessage({ tone: "error", text: formErrorMessage(body, "Les informations n'ont pas pu être enregistrées.") });
        return;
      }
      setMessage({
        tone: "success",
        text: body?.reverification
          ? "Enregistré. Votre entreprise repasse en vérification suite à ce changement."
          : "Informations enregistrées.",
      });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Une erreur réseau est survenue. Réessayez." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <FormField id="legalName" label="Raison sociale" error={errors.legalName}>
        <Input
          id="legalName"
          value={legalName}
          onChange={(event) => setLegalName(event.target.value)}
          aria-invalid={!!errors.legalName}
          aria-describedby={describedBy("legalName", errors.legalName)}
        />
      </FormField>
      <FormField id="siret" label="SIRET" error={errors.siret} hint={SIRET_HINT}>
        <Input
          id="siret"
          value={siret}
          onChange={(event) => setSiret(event.target.value)}
          aria-invalid={!!errors.siret}
          aria-describedby={describedBy("siret", errors.siret, SIRET_HINT)}
        />
      </FormField>
      <Button type="submit" size="sm" className="self-start" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
