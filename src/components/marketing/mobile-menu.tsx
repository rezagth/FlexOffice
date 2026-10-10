"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Search } from "lucide-react";
import { Dialog, DialogDescription, DialogTitle, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type HeaderLink = { href: string; label: string };

/**
 * Mobile navigation of the public header (UX-14): below `sm` the header used
 * to show the logo and two buttons — no search, no "Proposer un espace", no
 * menu. This sheet (Radix Dialog: focus trapped, Escape closes, focus back
 * on the button) carries a city search and every header link. It closes
 * itself on navigation.
 */
export function MobileMenu({
  links,
  account,
}: {
  links: HeaderLink[];
  /** Sign-in / sign-up, or the account link when signed in. */
  account: HeaderLink[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="px-3 sm:hidden" aria-label="Ouvrir le menu">
          <Menu aria-hidden="true" className="size-5" />
        </Button>
      </DialogTrigger>
      <SheetContent side="right" aria-describedby="mobile-menu-description">
        <div className="flex flex-col gap-1 pr-8">
          <DialogTitle className="text-lg font-semibold">Menu</DialogTitle>
          <DialogDescription id="mobile-menu-description" className="sr-only">
            Recherche et navigation du site
          </DialogDescription>
        </div>

        <form action="/search" role="search" className="flex flex-col gap-2">
          <Label htmlFor="mobile-menu-city">Rechercher un espace</Label>
          <div className="flex gap-2">
            <Input
              id="mobile-menu-city"
              name="city"
              type="search"
              placeholder="Ville (ex. Paris)"
              autoComplete="address-level2"
            />
            <Button type="submit" size="md" className="shrink-0 px-4" aria-label="Rechercher">
              <Search aria-hidden="true" />
            </Button>
          </div>
        </form>

        <nav aria-label="Navigation principale" className="flex flex-col gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className="rounded-lg px-3 py-2.5 text-base font-medium text-foreground hover:bg-muted aria-[current=page]:bg-muted"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
          {account.map((link, index) => (
            <ButtonLink
              key={link.href}
              href={link.href}
              variant={index === account.length - 1 ? "primary" : "outline"}
              className="w-full"
            >
              {link.label}
            </ButtonLink>
          ))}
        </div>
      </SheetContent>
    </Dialog>
  );
}
