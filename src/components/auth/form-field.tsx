import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/**
 * The `aria-describedby` value for a control: its error when there is one,
 * otherwise its hint. Put it ON the input (with `aria-invalid`) — a screen
 * reader only announces a description attached to the focused control
 * itself, not to a wrapper around it (UX-12).
 */
export function describedBy(id: string, error?: string, hint?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

/** Label + control + per-field hint or error, for the account forms. */
export function FormField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Form-level message (server error, success). */
export function FormMessage({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const styles =
    tone === "error"
      ? "bg-danger/10 text-danger"
      : tone === "success"
        ? "bg-primary/10 text-foreground"
        : "bg-muted text-foreground";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${styles}`}>
      {children}
    </p>
  );
}
