import Link from "next/link";
import type { ReactNode } from "react";
import { CollapsibleSidebar, SidebarNav, type SidebarNavItem } from "@/components/ui/sidebar-nav";
import { SignOutButton } from "./sign-out-button";

/** Shell of the admin back office: same collapsible sidebar and active-page
 * marking as the account space (AppShell). */
export function DashboardShell({
  navItems,
  roleLabel,
  userName,
  children,
}: {
  navItems: SidebarNavItem[];
  roleLabel: string;
  userName: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a href="#dashboard-content" className="skip-link">
        Aller au contenu
      </a>
      <CollapsibleSidebar
        brand={
          <Link href="/" className="text-lg font-semibold text-foreground">
            OfficeFlex
          </Link>
        }
      >
        <SidebarNav items={navItems} label="Navigation du back-office" />
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{roleLabel}</p>
          <p className="truncate text-sm font-medium text-foreground">{userName}</p>
          <SignOutButton />
        </div>
      </CollapsibleSidebar>
      <main
        id="dashboard-content"
        tabIndex={-1}
        className="flex-1 px-6 py-8 focus:outline-none md:px-10"
      >
        {children}
      </main>
    </div>
  );
}
