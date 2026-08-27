import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-base font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </Card>
  );
}

export function LoadingState({ label = "Chargement…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 px-6 py-16 justify-center">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary"
      />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

export function ErrorState({
  title = "Une erreur est survenue",
  description = "Merci de réessayer dans quelques instants.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card role="alert" className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <p className="text-base font-medium text-danger">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </Card>
  );
}

/** Placeholder for a brique not implemented yet in this iteration. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <EmptyState
      title={title}
      description="Cette fonctionnalité arrive dans une prochaine itération."
    />
  );
}
