"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type DocumentType =
  | "IDENTITY_DOCUMENT"
  | "OWNERSHIP_PROOF"
  | "K_BIS"
  | "VAT_PROOF"
  | "LEGAL_REPRESENTATIVE_ID"
  | "SUBLEASE_AUTHORIZATION"
  | "PROFESSIONAL_CARD"
  | "OTHER";

type UploadedDocument = {
  id: string;
  type: DocumentType;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
};

/**
 * Document upload (step 4) and recap/submit (step 5) for a DRAFT or
 * REJECTED dossier.
 *
 * The required slots come from the server (computed by the same
 * `requiredDocumentTypes()` the submit route enforces — see the page this
 * renders under), never recomputed here: the UI showing one set of slots
 * while the server accepts a different one is exactly the kind of drift
 * that would confuse a caller who did everything the screen asked.
 *
 * Each slot uploads independently and refreshes the page afterward — the
 * source of truth is what the server actually recorded, not local state that
 * could drift from it.
 */
export function VerificationDossier({
  verificationId,
  requiredTypes,
  requiredTypeLabels,
  initialDocuments,
  rejectionReason,
}: {
  verificationId: string;
  requiredTypes: DocumentType[];
  requiredTypeLabels: Record<DocumentType, string>;
  initialDocuments: UploadedDocument[];
  rejectionReason: string | null;
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputs = useRef<Partial<Record<DocumentType, HTMLInputElement | null>>>({});

  const documentsByType = (type: DocumentType) => documents.filter((d) => d.type === type);
  const isComplete = requiredTypes.every((type) => documentsByType(type).length > 0);

  async function handleUpload(type: DocumentType, file: File) {
    setError(null);
    setUploadingType(type);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);

    const response = await fetch(`/api/verifications/${verificationId}/documents`, {
      method: "POST",
      body: formData,
    });
    setUploadingType(null);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "L'envoi du document a échoué.");
      return;
    }

    const document = (await response.json()) as UploadedDocument;
    setDocuments((prev) => [...prev, document]);
  }

  async function handleDelete(documentId: string) {
    setError(null);
    setDeletingId(documentId);

    const response = await fetch(
      `/api/verifications/${verificationId}/documents/${documentId}`,
      { method: "DELETE" }
    );
    setDeletingId(null);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "La suppression a échoué.");
      return;
    }

    setDocuments((prev) => prev.filter((d) => d.id !== documentId));
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);

    const response = await fetch(`/api/verifications/${verificationId}/submit`, {
      method: "POST",
    });
    setSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "L'envoi du dossier a échoué.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {rejectionReason && (
        <Card className="border-danger/40 p-4">
          <p className="text-sm font-medium text-danger">Dossier refusé</p>
          <p className="mt-1 text-sm text-foreground">{rejectionReason}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Corrigez les documents concernés ci-dessous puis soumettez à
            nouveau votre dossier.
          </p>
        </Card>
      )}

      <section className="flex flex-col gap-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Étape 4 · Documents
        </p>

        {requiredTypes.map((type) => {
          const existing = documentsByType(type);
          return (
            <Card key={type} className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  {requiredTypeLabels[type]}
                </p>
                {existing.length > 0 ? (
                  <span className="text-xs font-medium text-primary">Envoyé</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Requis</span>
                )}
              </div>

              {existing.map((document) => (
                <div
                  key={document.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2"
                >
                  <span className="truncate text-xs text-foreground">
                    {document.originalFilename}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={deletingId === document.id}
                    onClick={() => handleDelete(document.id)}
                  >
                    {deletingId === document.id ? "…" : "Retirer"}
                  </Button>
                </div>
              ))}

              <div className="flex items-center gap-3">
                <input
                  ref={(el) => {
                    fileInputs.current[type] = el;
                  }}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) handleUpload(type, file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingType === type}
                  onClick={() => fileInputs.current[type]?.click()}
                >
                  {uploadingType === type
                    ? "Envoi…"
                    : existing.length > 0
                      ? "Ajouter un autre fichier"
                      : "Choisir un fichier"}
                </Button>
                <span className="text-xs text-muted-foreground">PDF, JPEG ou PNG · 10 Mo max</span>
              </div>
            </Card>
          );
        })}
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Étape 5 · Récapitulatif
        </p>
        <p className="text-sm text-muted-foreground">
          {isComplete
            ? "Tous les documents requis ont été envoyés. Vous pouvez soumettre votre dossier pour vérification."
            : "Envoyez tous les documents requis ci-dessus pour pouvoir soumettre votre dossier."}
        </p>
        <Button
          type="button"
          disabled={!isComplete || submitting}
          onClick={handleSubmit}
          className="self-start"
        >
          {submitting ? "Envoi…" : "Envoyer pour vérification"}
        </Button>
      </section>
    </div>
  );
}
