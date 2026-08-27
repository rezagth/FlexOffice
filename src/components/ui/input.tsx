import { clsx } from "clsx";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "h-11 w-full rounded-lg border border-border bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  );
}
