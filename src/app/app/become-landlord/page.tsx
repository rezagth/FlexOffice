import { redirect } from "next/navigation";
import { requirePageAuth } from "@/server/auth/page-guards";
import { BecomeLandlordForm } from "@/components/dashboard/become-landlord-form";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Devenir bailleur — OfficeFlex" };
export const dynamic = "force-dynamic";

/**
 * "Devenir bailleur" — opening a letting activity on an existing account.
 *
 * Available to every signed-in account, which is the whole point of the
 * single account: there is no separate partner signup to go through and no
 * second password to remember.
 *
 * An account that already has an activity is sent home rather than shown a
 * form that would fail — the service refuses a second activity in Phase 2
 * (joining an existing organization is an invitation flow, and running
 * several is the professional case).
 */
export default async function BecomeLandlordPage() {
  const ctx = await requirePageAuth({ redirectTo: "/app/become-landlord" });

  if (ctx.isLandlord) {
    redirect("/app");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Devenir bailleur</h1>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Vous gardez le même compte. Une fois votre activité activée, vous
          pourrez basculer entre le mode locataire et le mode bailleur à tout
          moment.
        </p>
      </div>

      <Card className="max-w-lg p-5">
        <BecomeLandlordForm />
      </Card>

      {/* Said plainly rather than discovered later: the activity opens now,
          publishing waits for verification. The organization is created
          PENDING_VERIFICATION and publication is already gated on that
          status. */}
      <p className="max-w-lg text-sm text-muted-foreground">
        Vos espaces devront être vérifiés avant publication. La vérification
        des pièces justificatives (pièce d&apos;identité, Kbis, titre de
        propriété ou autorisation de sous-location) arrive dans une prochaine
        itération : elle n&apos;est pas encore demandée ici.
      </p>
    </div>
  );
}
