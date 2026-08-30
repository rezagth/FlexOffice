"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SpaceModerationActions({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"publish" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "publish" | "reject") {
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
      <div className="flex gap-2">
        <Button size="sm" onClick={() => act("publish")} disabled={pending !== null}>
          {pending === "publish" ? "…" : "Valider"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => act("reject")}
          disabled={pending !== null}
        >
          {pending === "reject" ? "…" : "Rejeter"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
