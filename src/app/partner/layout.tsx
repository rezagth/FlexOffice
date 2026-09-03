import { requirePageOrg } from "@/server/auth/page-guards";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

const NAV_ITEMS = [
  { href: "/partner/dashboard", label: "Accueil" },
  { href: "/partner/spaces", label: "Mes espaces" },
  { href: "/partner/calendar", label: "Calendrier" },
  { href: "/partner/requests", label: "Demandes" },
  { href: "/partner/revenue", label: "Revenus" },
];

export default async function PartnerLayout({
  children,
}: LayoutProps<"/partner">) {
  const ctx = await requirePageOrg();

  return (
    <DashboardShell navItems={NAV_ITEMS} roleLabel="Espace entreprise" userName={ctx.name}>
      {children}
    </DashboardShell>
  );
}
