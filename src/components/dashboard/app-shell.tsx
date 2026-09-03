import Link from "next/link";
import type { ReactNode } from "react";
import type { AuthContext } from "@/server/auth/rbac";
import type { MembershipSummary } from "@/server/auth/active-context";
import { ModeSwitcher } from "./mode-switcher";
import { SignOutButton } from "./sign-out-button";

/**
 * The shell for the unified `/app` space.
 *
 * One shell for both modes, because it is one account. What changes between
 * modes is the navigation, and the navigation is derived from the resolved
 * capability set — not from the mode.
 *
 * That distinction matters beyond tidiness: an ACCOUNTANT in a landlord
 * organization sees "Comptabilité" and not "Mes biens", and a MANAGER sees
 * the reverse, without either of them being a different *mode*. Deriving the
 * nav from `capabilities` is what makes that fall out for free.
 *
 * The nav is UX, never security. Every page under `/app` asserts its own
 * requirement — see src/server/auth/page-guards.ts.
 */

type NavItem = { href: string; label: string };

function tenantNav(): NavItem[] {
  return [
    { href: "/app", label: "Accueil" },
    { href: "/search", label: "Rechercher" },
    { href: "/app/bookings", label: "Réservations" },
    { href: "/app/favorites", label: "Favoris" },
    { href: "/app/invoices", label: "Factures" },
    { href: "/app/messages", label: "Messages" },
    { href: "/app/account", label: "Compte" },
    { href: "/contact", label: "Nous contacter" },
  ];
}

function landlordNav(capabilities: AuthContext["capabilities"]): NavItem[] {
  const items: NavItem[] = [{ href: "/app", label: "Accueil" }];

  if (capabilities.has("landlord:manage_verification")) {
    items.push({ href: "/app/landlord/verification", label: "Vérification" });
  }
  if (capabilities.has("landlord:manage_properties")) {
    items.push({ href: "/app/landlord/properties", label: "Mes biens" });
  }
  if (capabilities.has("landlord:manage_spaces")) {
    items.push({ href: "/app/landlord/spaces", label: "Tous les espaces" });
  }
  if (capabilities.has("landlord:publish_listing")) {
    items.push({ href: "/app/landlord/listings", label: "Publications" });
  }
  if (capabilities.has("landlord:manage_calendar")) {
    items.push({ href: "/app/landlord/calendar", label: "Calendrier" });
  }
  if (capabilities.has("landlord:manage_bookings")) {
    items.push({ href: "/app/landlord/requests", label: "Réservations" });
  }
  items.push({ href: "/app/messages", label: "Messagerie" });
  if (capabilities.has("landlord:view_revenue")) {
    items.push({ href: "/app/landlord/revenue", label: "Comptabilité" });
  }
  items.push({ href: "/app/account", label: "Compte" });
  items.push({ href: "/contact", label: "Nous contacter" });

  return items;
}

export function AppShell({
  ctx,
  organizations,
  children,
}: {
  ctx: AuthContext;
  organizations: MembershipSummary[];
  children: ReactNode;
}) {
  const isLandlordMode = ctx.activeMode === "LANDLORD";
  const navItems = isLandlordMode ? landlordNav(ctx.capabilities) : tenantNav();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a
        href="#app-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Aller au contenu
      </a>

      <aside className="flex w-full shrink-0 flex-col gap-6 border-b border-border bg-card px-6 py-6 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <Link href="/" className="text-lg font-semibold text-foreground">
          OfficeFlex
        </Link>

        <ModeSwitcher
          activeMode={ctx.activeMode}
          isLandlord={ctx.isLandlord}
          organizations={organizations}
          activeOrgId={ctx.activeOrgId}
        />

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
          {/* Shown so an administrator can reach the back office without
              having to remember the URL — the mode dimension does not carry
              platform administration. */}
          {ctx.capabilities.has("admin:access_backoffice") && (
            <Link
              href="/admin/dashboard"
              className="rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-muted"
            >
              Back-office admin
            </Link>
          )}
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {isLandlordMode
              ? (organizations.find((o) => o.organizationId === ctx.activeOrgId)
                  ?.organizationName ?? "Espace bailleur")
              : "Espace locataire"}
          </p>
          <p className="truncate text-sm font-medium text-foreground">{ctx.name}</p>
          <SignOutButton />
        </div>
      </aside>

      <main id="app-content" className="flex-1 px-6 py-8 md:px-10">
        {children}
      </main>
    </div>
  );
}
