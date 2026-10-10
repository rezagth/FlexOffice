import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Kept as a single, unopinioned surface (no built-in padding) rather than
 * shadcn's compound Card (which bakes in its own header/content/footer
 * padding) — every one of this repo's ~35 call sites supplies its own
 * padding directly on <Card className="p-4 ..."> already, and switching
 * to shadcn's padded variant would double-pad every one of them. The
 * structured sub-components below are additive, for new composite work
 * that wants them, not a replacement any existing usage has to adopt.
 */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-2xl border border-border bg-card text-card-foreground shadow-sm", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 p-5", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-base font-medium leading-snug text-foreground", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-2 border-t border-border p-5", className)}
      {...props}
    />
  );
}
