import { clsx } from "clsx";
import type { SelectHTMLAttributes } from "react";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        "h-11 w-full rounded-lg border border-border bg-card px-4 text-sm text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  );
}
