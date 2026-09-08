import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

/** Same flat API as before (title, description, action) — the ~20 call
 * sites across the app don't need to change; only the internals now
 * compose shadcn's Empty/EmptyHeader/EmptyTitle/EmptyDescription. */
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
    <Card>
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {action && <EmptyContent>{action}</EmptyContent>}
      </Empty>
    </Card>
  );
}

export function LoadingState({ label = "Chargement…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 px-6 py-16 justify-center">
      <Spinner aria-hidden="true" className="text-primary" />
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
    <Card role="alert">
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyTitle className="text-danger">{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
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
