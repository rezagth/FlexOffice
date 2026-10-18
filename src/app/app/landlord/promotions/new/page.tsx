import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { listOrgSpaces } from "@/server/domains/spaces/list-org-spaces";
import { PromotionForm } from "@/components/dashboard/promotion-form";

export const metadata = { title: "Nouvelle promotion — MakomSpace" };
export const dynamic = "force-dynamic";

export default async function NewPromotionPage() {
  const ctx = await requirePageLandlordOrg("landlord:publish_listing");
  const spaces = await listOrgSpaces(ctx.activeOrgId);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Nouvelle promotion</h1>
      <PromotionForm spaces={spaces.map((s) => ({ id: s.id, name: s.name }))} />
    </div>
  );
}
