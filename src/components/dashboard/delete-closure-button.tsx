"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DeleteClosureButton({
  spaceId,
  closureId,
}: {
  spaceId: string;
  closureId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    try {
      await fetch(`/api/partner/spaces/${spaceId}/closures/${closureId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={remove} disabled={pending}>
      {pending ? "…" : "Supprimer"}
    </Button>
  );
}
