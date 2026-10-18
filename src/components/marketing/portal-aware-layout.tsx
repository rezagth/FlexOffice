import type { ReactNode } from "react";
import type { AuthContext } from "@/server/auth/rbac";
import { listActiveMemberships } from "@/server/auth/active-context";
import { AppShell } from "@/components/dashboard/app-shell";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

/**
 * PRD V1.1, R9-R14: search and the space sheet are PUBLIC pages, reachable
 * both by anonymous visitors and from inside a signed-in portal. Before this,
 * they always rendered the public marketing layout, so a tenant clicking
 * "Rechercher" from `/app` visibly left the portal — the sidebar and the
 * connected state disappeared even though no redirect ever happened.
 *
 * Same route, same data, adaptive layout: signed in, the content renders
 * inside AppShell (fixed sidebar, session, mode — R10/R14); signed out, the
 * public SiteHeader/SiteFooter (R13 — the page stays open to visitors who
 * never logged in). One shared component either way (R11), so the two
 * layouts cannot drift apart.
 */
export async function PortalAwareLayout({
  ctx,
  portalClassName,
  publicMainClassName,
  children,
}: {
  ctx: AuthContext | null;
  /** Wraps children inside AppShell's own padded `<main>` — width/gap only,
   * no padding (AppShell already pads the page). */
  portalClassName?: string;
  /** Used on the public layout's own `<main>`, typically with its padding. */
  publicMainClassName?: string;
  children: ReactNode;
}) {
  if (ctx) {
    const organizations = ctx.isLandlord ? await listActiveMemberships(ctx.userId) : [];
    return (
      <AppShell ctx={ctx} organizations={organizations}>
        <div className={portalClassName}>{children}</div>
      </AppShell>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="contenu" className={publicMainClassName}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
