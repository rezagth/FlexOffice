"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ArchiveSpaceButton({
  propertyId,
  spaceId,
}: {
  propertyId: string;
  spaceId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function archive() {
    if (!confirm("Archiver cet espace ? Il ne sera plus proposé à la réservation.")) return;
    setPending(true);
    try {
      await fetch(`/api/properties/${propertyId}/spaces/${spaceId}/archive`, { method: "POST" });
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
