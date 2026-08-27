import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/rbac";
import { dashboardPathForRole } from "@/server/auth/redirect-for-role";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

const NAV_ITEMS = [
  { href: "/client/dashboard", label: "Accueil" },
  { href: "/search", label: "Rechercher" },
  { href: "/client/bookings", label: "Mes réservations" },
  { href: "/client/favorites", label: "Favoris" },
  { href: "/client/invoices", label: "Factures" },
  { href: "/client/profile", label: "Profil" },
];

// Server-side role guard: this is the real authorization boundary, not
// the nav links above (which are just UX — hiding a link is not security).
export default async function ClientLayout({
  children,
}: LayoutProps<"/client">) {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect("/login?redirectTo=/client/dashboard");
  }
  if (ctx.role !== "CLIENT") {
    redirect(dashboardPathForRole(ctx.role));
  }

  return (
    <DashboardShell navItems={NAV_ITEMS} roleLabel="Espace client" userName={ctx.name}>
      {children}
    </DashboardShell>
  );
}
