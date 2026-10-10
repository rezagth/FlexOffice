import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** shadcn/ui Skeleton — a placeholder block shaped like the content that is
 * loading. Purely visual (`aria-hidden`): the loading announcement comes from
 * a LoadingState / role="status" next to it. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn("animate-pulse rounded-lg bg-muted", className)}
      {...props}
    />
  );
}
