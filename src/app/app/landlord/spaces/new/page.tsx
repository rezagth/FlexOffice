import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { SpaceForm } from "@/components/dashboard/space-form";

export default async function NewSpacePage() {
  // Guard only: the form posts to /api/partner/spaces, which resolves the
  // organization from the session itself. Nothing on this page needs the
  // context, but the page still has to assert who may see it.
  await requirePageLandlordOrg("landlord:manage_spaces");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Publier un espace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Votre espace est enregistré en brouillon. Soumettez-le ensuite pour
          validation : il sera visible publiquement une fois approuvé.
        </p>
      </div>
      <SpaceForm />
    </div>
  );
}
