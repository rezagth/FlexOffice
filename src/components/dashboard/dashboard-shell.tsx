import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "./sign-out-button";

type NavItem = { href: string; label: string };

export function DashboardShell({
  navItems,
  roleLabel,
  userName,
  children,
}: {
  navItems: NavItem[];
  roleLabel: string;
  userName: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a
        href="#dashboard-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Aller au contenu
      </a>
      <aside className="flex w-full shrink-0 flex-col gap-6 border-b border-border bg-card px-6 py-6 md:w-64 md:border-b-0 md:border-r md:min-h-screen">
        <Link href="/" className="text-lg font-semibold text-foreground">
          OfficeFlex
        </Link>
        <nav aria-label="Navigation principale" className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {roleLabel}
          </p>
          <p className="truncate text-sm font-medium text-foreground">{userName}</p>
          <SignOutButton />
        </div>
      </aside>
      <main id="dashboard-content" className="flex-1 px-6 py-8 md:px-10">
        {children}
      </main>
    </div>
  );
}
