import { notFound } from "next/navigation";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { listOrgSpaces } from "@/server/domains/spaces/list-org-spaces";
import { getPromotionForOrganization } from "@/server/domains/promotions/partner";
import { PromotionForm, type PromotionFormValues } from "@/components/dashboard/promotion-form";
import { NotFoundError } from "@/server/lib/errors";

export const metadata = { title: "Modifier la promotion — MakomSpace" };
export const dynamic = "force-dynamic";

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function EditPromotionPage({ params }: PageProps<"/app/landlord/promotions/[id]/edit">) {
  const ctx = await requirePageLandlordOrg("landlord:publish_listing");
  const { id } = await params;

  const [spaces, promotion] = await Promise.all([
    listOrgSpaces(ctx.activeOrgId),
    getPromotionForOrganization(ctx.activeOrgId, id).catch((error) => {
      if (error instanceof NotFoundError) return null;
      throw error;
    }),
  ]);
  if (!promotion) notFound();

  const initialValues: PromotionFormValues = {
    discountType: promotion.discountType,
    discountPercent: promotion.discountPercent?.toString() ?? "",
    discountAmount: promotion.discountAmountCents ? (promotion.discountAmountCents / 100).toString() : "",
    startsAt: toDateInputValue(promotion.startsAt),
    endsAt: toDateInputValue(promotion.endsAt),
    usageLimit: promotion.usageLimit?.toString() ?? "",
    spaceIds: promotion.spaces.map((s) => s.spaceId),
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Modifier la promotion</h1>
      <PromotionForm
        spaces={spaces.map((s) => ({ id: s.id, name: s.name }))}
        initialValues={initialValues}
        promotionId={promotion.id}
        canSubmitForReview={promotion.status === "DRAFT" || promotion.status === "REJECTED"}
      />
    </div>
  );
}
