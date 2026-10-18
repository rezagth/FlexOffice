"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { describedBy, FormField, FormMessage } from "./form-field";
import { focusFirstError, formErrorMessage, issuesToFieldErrors } from "./form-errors";
import { fieldErrors } from "@/lib/validation/auth";
import { domiciliationRequestSchema } from "@/lib/validation/domiciliation";

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Demande envoyée",
  IN_PROGRESS: "En cours de traitement",
  ACCEPTED: "Acceptée",
  REFUSED: "Refusée",
};

type DomiciliationRequestSummary = {
  kind: "MAKOMSPACE" | "THIRD_PARTY";
  status: "REQUESTED" | "IN_PROGRESS" | "ACCEPTED" | "REFUSED";
  domiciliataireName: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  attestationOriginalFilename: string | null;
};

/**
 * PRD V1.1, 2B, R53-R58 — the optional "Mon compte" section: never shown on
 * /app/complete-profile or /app/become-landlord (explicit scope of this
 * lot), and genuinely optional here — nothing in profile-completion.ts gates
 * on it.
 */
export function DomiciliationSection({
  organizationId,
  canEdit,
  domiciliationOfferEnabled,
  initialRequest,
}: {
  organizationId: string;
  canEdit: boolean;
  domiciliationOfferEnabled: boolean;
  initialRequest: DomiciliationRequestSummary | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!initialRequest);
  const [kind, setKind] = useState<"MAKOMSPACE" | "THIRD_PARTY" | "">(initialRequest?.kind ?? "");
  const [domiciliataireName, setDomiciliataireName] = useState(initialRequest?.domiciliataireName ?? "");
  const [domiciliationAddress, setDomiciliationAddress] = useState(initialRequest?.address ?? "");
  const [domiciliationCity, setDomiciliationCity] = useState(initialRequest?.city ?? "");
  const [domiciliationPostalCode, setDomiciliationPostalCode] = useState(initialRequest?.postalCode ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  // S11 — same forced value as the signup wizard when the offer is off.
  useEffect(() => {
    if (!domiciliationOfferEnabled && !kind) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derives a forced value from an external, read-only switch (domiciliationOfferEnabled), not a render-triggered cascade
      setKind("THIRD_PARTY");
    }
  }, [domiciliationOfferEnabled, kind]);

  async function submitChoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const payload = {
      domiciliationKind: kind || undefined,
      domiciliataireName: domiciliataireName.trim() || undefined,
      domiciliationAddress: domiciliationAddress.trim() || undefined,
      domiciliationCity: domiciliationCity.trim() || undefined,
      domiciliationPostalCode: domiciliationPostalCode.trim() || undefined,
    };
    const parsed = domiciliationRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      focusFirstError(next, ["domiciliationKind", "domiciliataireName", "domiciliationAddress", "domiciliationCity", "domiciliationPostalCode"]);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const response = await fetch(`/api/account/organization/${organizationId}/domiciliation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setErrors(issuesToFieldErrors(body));
        setMessage({ tone: "error", text: formErrorMessage(body, "La demande n'a pas pu être enregistrée.") });
        return;
      }
      setMessage({ tone: "success", text: "Demande de domiciliation enregistrée." });
      setEditing(false);
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Une erreur réseau est survenue. Réessayez." });
    } finally {
      setPending(false);
    }
  }

  async function uploadAttestation(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadMessage(null);
    setUploadPending(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch(`/api/account/organization/${organizationId}/domiciliation/attestation`, {
        method: "POST",
        body: formData,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setUploadMessage(formErrorMessage(body, "Le fichier n'a pas pu être déposé."));
        return;
      }
      setUploadMessage("Attestation déposée.");
      router.refresh();
    } catch {
      setUploadMessage("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setUploadPending(false);
      event.target.value = "";
    }
  }

  async function viewAttestation() {
    try {
      const response = await fetch(`/api/account/organization/${organizationId}/domiciliation/attestation`);
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.signedUrl) {
        setUploadMessage("L'attestation n'a pas pu être ouverte.");
        return;
      }
      window.open(body.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      setUploadMessage("Une erreur réseau est survenue. Réessayez.");
    }
  }

  if (!editing && initialRequest) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        <dl className="flex flex-col gap-2">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Domiciliation</dt>
            <dd className="font-medium">
              {initialRequest.kind === "MAKOMSPACE" ? "Chez MakomSpace" : "Déjà domicilié ailleurs"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Statut</dt>
            <dd className="font-medium">{STATUS_LABELS[initialRequest.status]}</dd>
          </div>
          {initialRequest.kind === "THIRD_PARTY" && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Domiciliataire</dt>
              <dd className="truncate font-medium">{initialRequest.domiciliataireName}</dd>
            </div>
          )}
        </dl>

        {initialRequest.kind === "THIRD_PARTY" && canEdit && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            {uploadMessage && <p className="text-xs text-muted-foreground">{uploadMessage}</p>}
            {initialRequest.attestationOriginalFilename ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Attestation déposée : {initialRequest.attestationOriginalFilename}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={viewAttestation}>
                  Consulter
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Aucune attestation déposée.</p>
            )}
            <label className="self-start">
              <span
                className={clsx(
                  "inline-flex h-9 cursor-pointer items-center justify-center rounded-full border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted",
                  uploadPending && "pointer-events-none opacity-50"
                )}
              >
                {uploadPending ? "Envoi…" : "Déposer l'attestation (PDF, JPEG, PNG)"}
              </span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="sr-only"
                onChange={uploadAttestation}
                disabled={uploadPending}
              />
            </label>
          </div>
        )}

        {canEdit && (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setEditing(true)}>
            Modifier
          </Button>
        )}
      </div>
    );
  }

  if (!canEdit) {
    return <p className="text-sm text-muted-foreground">Domiciliation non renseignée.</p>;
  }

  return (
    <form onSubmit={submitChoice} noValidate className="flex flex-col gap-4">
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Comment votre société est-elle domiciliée ?</legend>
        {domiciliationOfferEnabled ? (
          <div role="radiogroup" aria-label="Domiciliation" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { value: "MAKOMSPACE" as const, label: "Je veux être domicilié chez MakomSpace" },
              { value: "THIRD_PARTY" as const, label: "Mon siège est déjà domicilié ailleurs" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={kind === option.value}
                onClick={() => setKind(option.value)}
                className={clsx(
                  "rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
                  kind === option.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Votre siège est domicilié ailleurs qu&apos;à une adresse MakomSpace.</p>
        )}
        {errors.domiciliationKind && <p className="text-xs text-danger">{errors.domiciliationKind}</p>}
      </fieldset>

      {(kind === "THIRD_PARTY" || !domiciliationOfferEnabled) && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <FormField id="domiciliataireName" label="Nom du domiciliataire" error={errors.domiciliataireName}>
            <Input
              id="domiciliataireName"
              value={domiciliataireName}
              onChange={(e) => setDomiciliataireName(e.target.value)}
              aria-invalid={!!errors.domiciliataireName}
              aria-describedby={describedBy("domiciliataireName", errors.domiciliataireName)}
            />
          </FormField>
          <FormField id="domiciliationAddress" label="Adresse de domiciliation" error={errors.domiciliationAddress}>
            <Input
              id="domiciliationAddress"
              value={domiciliationAddress}
              onChange={(e) => setDomiciliationAddress(e.target.value)}
              aria-invalid={!!errors.domiciliationAddress}
              aria-describedby={describedBy("domiciliationAddress", errors.domiciliationAddress)}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="domiciliationCity" label="Ville" error={errors.domiciliationCity}>
              <Input
                id="domiciliationCity"
                value={domiciliationCity}
                onChange={(e) => setDomiciliationCity(e.target.value)}
                aria-invalid={!!errors.domiciliationCity}
                aria-describedby={describedBy("domiciliationCity", errors.domiciliationCity)}
              />
            </FormField>
            <FormField id="domiciliationPostalCode" label="Code postal" error={errors.domiciliationPostalCode}>
              <Input
                id="domiciliationPostalCode"
                value={domiciliationPostalCode}
                onChange={(e) => setDomiciliationPostalCode(e.target.value)}
                aria-invalid={!!errors.domiciliationPostalCode}
                aria-describedby={describedBy("domiciliationPostalCode", errors.domiciliationPostalCode)}
              />
            </FormField>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {initialRequest && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}
