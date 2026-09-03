import Link from "next/link";
import { requirePageAdmin } from "@/server/auth/page-guards";
import { listVerificationsForAdmin } from "@/server/domains/verification/get";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import {
  HOLDER_TYPE_LABELS,
  LANDLORD_ACTIVITY_TYPE_LABELS,
  VERIFICATION_STATUS_LABELS,
} from "@/lib/format";

export const metadata = { title: "Vérifications — Admin OfficeFlex" };
export const dynamic = "force-dynamic";

/**
 * The review queue. "À vérifier" bundles PENDING_REVIEW and IN_REVIEW — the
 * two states that actually need a reviewer's attention — ahead of dossiers
 * already settled one way or the other.
 */
export default async function AdminVerificationsPage() {
  await requirePageAdmin();
  const verifications = await listVerificationsForAdmin("ALL");

  const toReview = verifications.filter(
    (v) => v.status === "PENDING_REVIEW" || v.status === "IN_REVIEW"
  );
  const settled = verifications.filter(
    (v) => v.status !== "PENDING_REVIEW" && v.status !== "IN_REVIEW"
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Vérifications</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">
          À vérifier{toReview.length > 0 ? ` (${toReview.length})` : ""}
        </h2>
        {toReview.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun dossier en attente.</p>
        ) : (
          toReview.map((v) => (
            <Link key={v.id} href={`/admin/verifications/${v.id}`} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted">
                <div>
                  <p className="font-medium text-foreground">{v.organization.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {HOLDER_TYPE_LABELS[v.organization.holderType]} ·{" "}
                    {LANDLORD_ACTIVITY_TYPE_LABELS[v.activityType]} · {v._count.documents}{" "}
                    document{v._count.documents > 1 ? "s" : ""}
                  </p>
                </div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  {VERIFICATION_STATUS_LABELS[v.status] ?? v.status}
                </p>
              </Card>
            </Link>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Tous les dossiers</h2>
        {settled.length === 0 ? (
          <EmptyState
            title="Aucun autre dossier"
            description="Les dossiers approuvés, refusés ou en brouillon apparaîtront ici."
          />
        ) : (
          settled.map((v) => (
            <Link key={v.id} href={`/admin/verifications/${v.id}`} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted">
                <div>
                  <p className="font-medium text-foreground">{v.organization.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {HOLDER_TYPE_LABELS[v.organization.holderType]} ·{" "}
                    {LANDLORD_ACTIVITY_TYPE_LABELS[v.activityType]}
                  </p>
                </div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {VERIFICATION_STATUS_LABELS[v.status] ?? v.status}
                </p>
              </Card>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
