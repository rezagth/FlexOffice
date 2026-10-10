"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AdminActionButton } from "@/components/dashboard/admin-action-button";

/** Decision on a listing awaiting review. Rejecting asks for a reason
 * (optional), which the landlord receives by e-mail. */
export function SpaceModerationActions({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"publish" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "publish") {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/admin/spaces/${spaceId}/${action}`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json();
        setError(body?.error?.message ?? "L'action a échoué.");
        return;
      }
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-start justify-end gap-2">
        <Button size="sm" onClick={() => act("publish")} disabled={pending !== null}>
          {pending === "publish" ? "…" : "Valider"}
        </Button>
        <AdminActionButton
          url={`/api/admin/spaces/${spaceId}/reject`}
          label="Rejeter"
          confirmLabel="Confirmer le rejet"
          reason="optional"
          reasonLabel="Motif du rejet"
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
