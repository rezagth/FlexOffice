"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SubmitSpaceButton({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/partner/spaces/${spaceId}/submit`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json();
        setError(body?.error?.message ?? "La soumission a échoué.");
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
    <div className="flex flex-col items-end gap-1">
      <Button onClick={submit} disabled={pending}>
        {pending ? "Envoi…" : "Soumettre pour validation"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
