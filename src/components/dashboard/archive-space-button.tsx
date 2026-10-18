"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ArchiveSpaceButton({
  propertyId,
  spaceId,
  upcomingBookingsCount,
}: {
  propertyId: string;
  spaceId: string;
  /** R63 — shown in the confirmation so the decision is informed: archiving
   * never cancels these, the landlord stays committed to honoring them. */
  upcomingBookingsCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function archive() {
    const warning =
      upcomingBookingsCount > 0
        ? `Archiver cet espace ? Il ne sera plus proposé à la réservation. ${upcomingBookingsCount} réservation${upcomingBookingsCount > 1 ? "s" : ""} à venir sur cet espace ${upcomingBookingsCount > 1 ? "restent" : "reste"} entièrement à votre charge : elles ne seront pas annulées.`
        : "Archiver cet espace ? Il ne sera plus proposé à la réservation.";
    if (!confirm(warning)) return;
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
