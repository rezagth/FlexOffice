import Link from "next/link";
import { requirePageAdmin } from "@/server/auth/page-guards";
import { listReviewsForAdmin, reviewAuthorLabel } from "@/server/domains/reviews/reviews";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { StarRating } from "@/components/reviews/star-rating";
import { AdminActionButton } from "@/components/dashboard/admin-action-button";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Avis — Admin MakomSpace" };
export const dynamic = "force-dynamic";

/** Moderation of reviews: hide one that breaks the rules (insult, personal
 * data, off-topic, advertising), with a reason kept in the audit log. A
 * review is never deleted. */
export default async function AdminReviewsPage() {
  await requirePageAdmin();
  const reviews = await listReviewsForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Avis</h1>
        <p className="text-sm text-muted-foreground">
          Masquez un avis injurieux, hors sujet, publicitaire ou contenant des données personnelles. Un
          avis négatif mais sincère ne se masque pas.
        </p>
      </div>

      {reviews.length === 0 ? (
        <EmptyState title="Aucun avis pour l'instant" description="Les avis des clients apparaîtront ici." />
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map((review) => (
            <Card key={review.id} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">
                    <Link href={`/spaces/${review.space.slug}`} className="hover:underline">
                      {review.space.name}
                    </Link>{" "}
                    <span className="text-sm font-normal text-muted-foreground">· {review.organization.name}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {reviewAuthorLabel(review.author)}
                    {review.author.deletedAt ? "" : ` (${review.author.email})`} · {formatDateTime(review.createdAt)}
                  </p>
                </div>
                <p className="flex items-center gap-1">
                  <StarRating value={review.rating} />
                  <span className="sr-only">{review.rating} sur 5</span>
                </p>
              </div>
              {review.comment && <p className="whitespace-pre-line text-sm text-foreground">{review.comment}</p>}
              {review.landlordReply && (
                <p className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
                  <span className="font-medium">Réponse : </span>
                  {review.landlordReply}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {review.hiddenAt ? (
                  <>
                    <p className="text-xs font-medium text-danger">
                      Masqué le {formatDateTime(review.hiddenAt)}
                      {review.hiddenReason ? ` — ${review.hiddenReason}` : ""}
                    </p>
                    <AdminActionButton
                      url={`/api/admin/reviews/${review.id}/unhide`}
                      label="Réafficher"
                      confirmLabel="Confirmer"
                      warning="L'avis redeviendra visible sur la fiche et comptera de nouveau dans la note moyenne."
                    />
                  </>
                ) : (
                  <AdminActionButton
                    url={`/api/admin/reviews/${review.id}/hide`}
                    label="Masquer"
                    confirmLabel="Confirmer le masquage"
                    reason="required"
                    reasonHint="Le motif est conservé dans le journal d'audit ; le bailleur voit que l'avis a été masqué."
                    warning="L'avis disparaîtra de la fiche publique et de la note moyenne. Son texte est conservé."
                  />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
