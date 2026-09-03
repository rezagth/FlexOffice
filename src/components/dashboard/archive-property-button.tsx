"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ArchivePropertyButton({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function archive() {
    if (!confirm("Archiver ce bien ? Il restera consultable mais ne pourra plus être modifié.")) return;
    setPending(true);
    try {
      await fetch(`/api/properties/${propertyId}/archive`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={archive} disabled={pending}>
      {pending ? "…" : "Archiver"}
    </Button>
  );
}
