import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Variant names match the small pill patterns already scattered across
 * the app (verified badge, discount badge, amenity tags) rather than
 * shadcn's default/secondary/destructive vocabulary — "accent" is this
 * repo's existing "important, not an error" tint (bg-accent/10
 * text-accent, already used for the discount badge and the verified-org
 * badge), "muted" is the neutral tag style already used for amenity
 * pills.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-3 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        accent: "bg-accent/10 text-accent",
        muted: "bg-muted text-muted-foreground",
        outline: "border border-border text-foreground",
        destructive: "bg-danger/10 text-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean };

export function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}
