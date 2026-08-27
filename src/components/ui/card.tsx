import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-border bg-card text-card-foreground shadow-sm",
        className
      )}
      {...props}
    />
  );
}
