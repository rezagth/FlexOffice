"use client";

import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * A block that can be folded away behind one line and one button. Used for the
 * landlord's "Premiers pas": once the account can already publish, the list
 * is out of the way by default but one click brings it back. The content is
 * rendered by the server and handed over as children, so folding it costs no
 * extra request.
 */
export function CollapsibleSection({
  title,
  summary,
  defaultOpen,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (open) {
    return (
      <div className="flex flex-col gap-2">
        {children}
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setOpen(false)}>
          Masquer {title.toLowerCase()}
        </Button>
      </div>
    );
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{summary}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-expanded={false}>
        Afficher
      </Button>
    </Card>
  );
}
