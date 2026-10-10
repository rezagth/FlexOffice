import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Variant names match the small pill patterns already scattered across
 * the app (verified badge, discount badge, amenity tags) rather than
 * shadcn's default/secondary/destructive vocabulary — "muted" is the
 * neutral tag style already used for amenity pills.
 *
 * "accent" is this repo's "important, not an error" tint. It renders as a
 * solid Navy pill with a Gold icon rather than gold-tinted text
 * (bg-accent/10 text-accent, the pre-rebrand version): the brand's Gold
 * (#C5A059) is reserved for icons, large fills and dark surfaces — small
 * gold text on a light background is a known contrast problem flagged
 * during the Stitch mockup review, so this variant never puts brand gold
 * behind a light background as text color.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-3 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        accent: "bg-primary text-primary-foreground [&>svg]:text-accent",
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
