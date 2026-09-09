import { CalendarX, Lock, LifeBuoy, ShieldCheck } from "lucide-react";
import type { ComponentType } from "react";

const BADGES: { icon: ComponentType<{ className?: string }>; label: string }[] = [
  { icon: Lock, label: "Paiement sécurisé" },
  { icon: ShieldCheck, label: "Espaces vérifiés" },
  { icon: LifeBuoy, label: "Support 7/7" },
  { icon: CalendarX, label: "Sans abonnement" },
];

export function TrustBadges() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {BADGES.map((badge) => (
            <div key={badge.label} className="flex items-center gap-2 text-muted-foreground">
              <badge.icon aria-hidden="true" className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">{badge.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
