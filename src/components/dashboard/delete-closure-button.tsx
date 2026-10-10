"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiErrorMessage, NETWORK_ERROR_MESSAGE } from "@/lib/api-error";

/** Deletes a closure period after confirmation (UX-22). A failure is shown
 * in the dialog instead of being ignored. */
export function DeleteClosureButton({
  spaceId,
  closureId,
  label,
}: {
  spaceId: string;
  closureId: string;
  /** Human description of the closure ("du 12 au 14 octobre"), for the
   * confirmation text. */
  label?: string;
}) {
  const router = useRouter();

  async function remove(): Promise<string | null> {
    try {
      const response = await fetch(`/api/partner/spaces/${spaceId}/closures/${closureId}`, {
        method: "DELETE",
      });
      if (!response.ok) return await apiErrorMessage(response, "La suppression a échoué.");
      router.refresh();
      return null;
    } catch {
      return NETWORK_ERROR_MESSAGE;
    }
  }

  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm">
          Supprimer
        </Button>
      }
      title="Supprimer cette fermeture ?"
      description={
        label
          ? `La fermeture ${label} sera supprimée et ces dates redeviendront réservables.`
          : "Ces dates redeviendront réservables."
      }
      confirmLabel="Supprimer"
      pendingLabel="Suppression…"
      onConfirm={remove}
    />
  );
}
