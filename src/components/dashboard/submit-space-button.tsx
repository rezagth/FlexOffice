"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * `missingProfileItems` comes from the page (server-side, same rule as the
 * API): when it is not empty the button is shown disabled with the reason and
 * a direct link, instead of letting the landlord click and hit an error. The
 * API still enforces the rule — if the profile became incomplete between
 * render and click, the PROFILE_INCOMPLETE answer shows the same link.
 */
export function SubmitSpaceButton({
  spaceId,
  missingProfileItems = [],
}: {
  spaceId: string;
  missingProfileItems?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileBlocked, setProfileBlocked] = useState(false);

  const completeProfileHref = `/app/complete-profile?redirectTo=${encodeURIComponent(pathname ?? "/app/landlord")}`;
  const blocked = missingProfileItems.length > 0;

  async function submit() {
    setPending(true);
    setError(null);
    setProfileBlocked(false);
    try {
      const response = await fetch(`/api/partner/spaces/${spaceId}/submit`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json();
        setError(body?.error?.message ?? "La soumission a échoué.");
        setProfileBlocked(body?.error?.code === "PROFILE_INCOMPLETE");
        return;
      }
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex max-w-sm flex-col items-end gap-2">
      <Button onClick={submit} disabled={pending || blocked}>
        {pending ? "Envoi…" : "Soumettre pour validation"}
      </Button>
      {blocked && (
        <div role="note" className="rounded-lg border border-border bg-muted p-3 text-left text-xs text-foreground">
          <p className="font-medium">Votre profil doit être complété avant de publier.</p>
          <p className="mt-1 text-muted-foreground">Il vous reste à : {missingProfileItems.join(" ; ")}.</p>
          <Link href={completeProfileHref} className="mt-2 inline-block font-medium underline">
            Compléter mon profil
          </Link>
        </div>
      )}
      {error && (
        <p role="alert" className="text-left text-xs text-danger">
          {error}
          {profileBlocked && (
            <>
              {" "}
              <Link href={completeProfileHref} className="font-medium underline">
                Compléter mon profil
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
