import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";

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

export function LoadingState({
  label = "Chargement…",
  compact = false,
}: {
  label?: string;
  /** A single line above a skeleton (loading.tsx files) rather than a
   * centred block. */
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        compact
          ? "flex items-center gap-2"
          : "flex items-center justify-center gap-3 px-6 py-16"
      }
    >
      <Spinner aria-hidden="true" className="text-primary" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

/** Skeleton of a dashboard page — title, a row of cards, a list. Shown by
 * the loading.tsx files of /app and /admin while the server renders. */
export function DashboardPageSkeleton({ label = "Chargement de la page…" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-6">
      <LoadingState label={label} compact />
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
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
