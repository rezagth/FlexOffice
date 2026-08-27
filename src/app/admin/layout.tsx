import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/rbac";
import { dashboardPathForRole } from "@/server/auth/redirect-for-role";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Vue d'ensemble" },
  { href: "/admin/organizations", label: "Entreprises" },
  { href: "/admin/listings", label: "Annonces" },
  { href: "/admin/payments", label: "Paiements" },
  { href: "/admin/disputes", label: "Litiges" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect("/login?redirectTo=/admin/dashboard");
  }
  if (ctx.role !== "ADMIN") {
    redirect(dashboardPathForRole(ctx.role));
  }

  return (
    <DashboardShell navItems={NAV_ITEMS} roleLabel="Back-office admin" userName={ctx.name}>
      {children}
    </DashboardShell>
  );
}
