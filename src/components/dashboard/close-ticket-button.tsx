"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CloseTicketButton({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClose() {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/support/tickets/${ticketId}/close`, {
        method: "POST",
      });
      if (response.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={handleClose}>
      {pending ? "…" : "Clore"}
    </Button>
  );
}
