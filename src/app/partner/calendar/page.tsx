import { getAuthContext } from "@/server/auth/rbac";
import { ComingSoon } from "@/components/dashboard/states";

export default async function PartnerCalendarPage() {
  if (!(await getAuthContext())) return null; // layout already enforces the role; this guards the brief render race before that redirect completes
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Calendrier de disponibilité</h1>
      <ComingSoon title="Calendrier (disponible / réservé / bloqué) à venir" />
    </div>
  );
}
