"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Same click-to-fetch-a-signed-URL pattern as
 * verification-document-viewer.tsx — never minted until the admin actually
 * asks, and viewing is audited server-side before the URL is returned. */
export function DomiciliationAttestationViewer({ requestId }: { requestId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/admin/domiciliations/${requestId}/attestation`);
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.signedUrl) {
        setError("Le document n'a pas pu être ouvert.");
        return;
      }
      window.open(body.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={open} disabled={pending}>
        {pending ? "…" : "Consulter l'attestation"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
