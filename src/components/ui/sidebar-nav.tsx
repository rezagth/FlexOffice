"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SidebarNavItem = { href: string; label: string };

/**
 * The item a pathname belongs to: the longest href that is the pathname or
 * one of its parents. "/app" must not stay highlighted on "/app/bookings",
 * and "/app/landlord/properties" must stay highlighted on one property.
 */
export function activeNavHref(pathname: string, items: SidebarNavItem[]): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (!best || href.length > best.length) best = href;
    }
  }
  return best;
}

/** Vertical navigation with the current page marked `aria-current="page"`
 * (UX-20) — announced by screen readers, and styled. */
export function SidebarNav({ items, label }: { items: SidebarNavItem[]; label: string }) {
  const pathname = usePathname();
  const active = activeNavHref(pathname, items);

  return (
    <nav aria-label={label} className="flex flex-1 flex-col gap-1">
      {items.map((item) => {
        const current = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              current
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--accent)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Sidebar of the signed-in spaces (UX-21). From `md` up it is the usual
 * left column. Below, the menu used to be stacked in full above the content
 * — a dozen links to scroll past on every page; it is now folded behind a
 * "Menu" button in a compact top bar, and folds back after navigating.
 */
export function CollapsibleSidebar({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Fold the menu back when the route changes (state reset during render,
  // the React-recommended alternative to an effect).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-sidebar-border bg-sidebar md:min-h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between gap-4 px-6 py-4 md:py-6">
        {brand}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted md:hidden"
          aria-expanded={open}
          aria-controls="sidebar-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" className="size-4" /> : <Menu aria-hidden="true" className="size-4" />}
          {open ? "Fermer" : "Menu"}
        </button>
      </div>
      <div
        id="sidebar-menu"
        className={cn("flex-1 flex-col gap-6 px-6 pb-6 md:flex", open ? "flex" : "hidden")}
      >
        {children}
      </div>
    </aside>
  );
}
