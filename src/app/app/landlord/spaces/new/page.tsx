import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { listPropertiesForOrg } from "@/server/domains/properties/get";
import { SpaceForm } from "@/components/dashboard/space-form";

export const dynamic = "force-dynamic";

export default async function NewSpacePage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  // Guard only for the form itself: it posts to /api/partner/spaces, which
  // resolves the organization from the session itself. The property list is
  // the one thing this page does need context for.
  const ctx = await requirePageLandlordOrg("landlord:manage_spaces");
  const { propertyId } = await searchParams;

  const properties = await listPropertiesForOrg(ctx.activeOrgId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Publier un espace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Votre espace est enregistré en brouillon. Soumettez-le ensuite pour
          validation : il sera visible publiquement une fois approuvé.
        </p>
      </div>
      <SpaceForm
        properties={properties.map((p) => ({ id: p.id, label: p.label }))}
        initialPropertyId={propertyId}
      />
    </div>
  );
}
