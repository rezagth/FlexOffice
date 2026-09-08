import * as React from "react";
import Link from "next/link";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui's cva + Radix Slot mechanics, but keeping this repo's own
 * variant/size vocabulary (primary/secondary/outline/ghost,
 * sm/md/lg) and pill shape (rounded-full) rather than shadcn's defaults
 * (default/destructive/link, rounded-lg) — every one of the ~50 existing
 * call sites passes one of these names, and the brief asks to preserve
 * the current API rather than cascade a rename through them all.
 * "secondary" intentionally renders in the brand accent color (not a
 * neutral gray): that was already this button's own meaning of
 * "secondary", not shadcn's.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "bg-accent text-accent-foreground hover:brightness-95",
        outline: "border border-border bg-transparent text-foreground hover:bg-muted",
        ghost: "bg-transparent text-foreground hover:bg-muted",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-sm",
        lg: "h-13 px-8 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

/** Kept for the few call sites that compute button classes without
 * rendering a <button> (e.g. a styled <a> that isn't ButtonLink). */
export function buttonClasses(
  variant?: ButtonVariant | null,
  size?: ButtonSize | null,
  className?: string
) {
  return cn(buttonVariants({ variant, size, className }));
}

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Renders the child element instead of a <button>, merging props
     * onto it (Radix Slot) — for a case that needs Button's styling on
     * something other than a real button/link. */
    asChild?: boolean;
  };

export function Button({ variant, size, className, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={buttonClasses(variant, size, className)}
      {...props}
    />
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>;

export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link data-slot="button" className={buttonClasses(variant, size, className)} {...props} />;
}
