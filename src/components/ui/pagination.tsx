import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";

export function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

export function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="pagination-content" className={cn("flex items-center gap-0.5", className)} {...props} />;
}

export function PaginationItem(props: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />;
}

export function PaginationLink({
  className,
  isActive,
  href,
  disabled,
  ...props
}: React.ComponentProps<typeof Link> & { isActive?: boolean; disabled?: boolean }) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={cn(buttonClasses("ghost", "sm"), "pointer-events-none opacity-40", className)}
      />
    );
  }
  return (
    <Link
      href={href}
      data-slot="pagination-link"
      data-active={isActive}
      aria-current={isActive ? "page" : undefined}
      className={cn(buttonClasses(isActive ? "outline" : "ghost", "sm"), className)}
      {...props}
    />
  );
}

export function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink aria-label="Page précédente" className={cn("gap-1.5", className)} {...props}>
      <ChevronLeft aria-hidden="true" />
      <span className="hidden sm:inline">Précédent</span>
    </PaginationLink>
  );
}

export function PaginationNext({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink aria-label="Page suivante" className={cn("gap-1.5", className)} {...props}>
      <span className="hidden sm:inline">Suivant</span>
      <ChevronRight aria-hidden="true" />
    </PaginationLink>
  );
}
