"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * "View" fetches a signed URL on demand and opens it — never a stored or
 * public URL, since the bucket is private and the URL expires in minutes
 * (see SIGNED_URL_TTL_SECONDS). Fetching only on click, rather than on page
 * load for every document, keeps a review screen with many dossiers from
 * minting URLs nobody looks at.
 */
export function VerificationDocumentViewer({
  verificationId,
  documentId,
}: {
  verificationId: string;
  documentId: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleView() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/verifications/${verificationId}/documents/${documentId}`
      );
      if (!response.ok) {
        setError("Impossible d'ouvrir ce document.");
        return;
      }
      const { signedUrl } = (await response.json()) as { signedUrl: string };
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={handleView}>
        {pending ? "…" : "Consulter"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
