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
 * An account that already has an activity is sent to its verification
 * dossier rather than home — Phase 2 sent it to `/app`, but now that a
 * dossier always exists once an activity is open (see
 * domains/organizations/become-landlord.ts), that page is the genuinely
 * useful next step rather than a dead end.
 */
export default async function BecomeLandlordPage() {
  const ctx = await requirePageAuth({ redirectTo: "/app/become-landlord" });

  if (ctx.isLandlord) {
    redirect("/app/landlord/verification");
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

      {/* Said plainly rather than discovered later: publication waits for a
          verified dossier — see /app/landlord/verification, reached right
          after this form. */}
      <p className="max-w-lg text-sm text-muted-foreground">
        La prochaine étape vous demandera les pièces justificatives
        nécessaires (pièce d&apos;identité, Kbis, titre de propriété ou
        autorisation de sous-location selon votre situation). Vos espaces ne
        pourront être publiés qu&apos;une fois votre dossier vérifié.
      </p>
    </div>
  );
}
