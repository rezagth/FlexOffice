import { requirePageAdmin } from "@/server/auth/page-guards";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Vue d'ensemble" },
  { href: "/admin/organizations", label: "Entreprises" },
  { href: "/admin/verifications", label: "Vérifications" },
  { href: "/admin/listings", label: "Annonces" },
  { href: "/admin/payments", label: "Paiements" },
  { href: "/admin/disputes", label: "Litiges" },
  { href: "/admin/support", label: "Support" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const ctx = await requirePageAdmin();

  return (
    <DashboardShell navItems={NAV_ITEMS} roleLabel="Back-office admin" userName={ctx.name}>
      {children}
    </DashboardShell>
  );
}
