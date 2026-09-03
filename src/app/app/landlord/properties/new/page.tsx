import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { PropertyForm } from "@/components/dashboard/property-form";

export const metadata = { title: "Ajouter un bien — OfficeFlex" };
export const dynamic = "force-dynamic";

export default async function NewPropertyPage() {
  await requirePageLandlordOrg("landlord:manage_properties");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Ajouter un bien</h1>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Votre organisation devient propriétaire et exploitante de ce bien.
          Vous pourrez ensuite y ajouter les espaces à louer.
        </p>
      </div>

      <PropertyForm />
    </div>
  );
}
