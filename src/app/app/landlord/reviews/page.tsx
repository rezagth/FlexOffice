import Link from "next/link";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { listOrganizationReviews, reviewAuthorLabel } from "@/server/domains/reviews/reviews";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { RatingSummary, StarRating } from "@/components/reviews/star-rating";
import { ReviewReplyForm } from "@/components/reviews/review-reply-form";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Avis clients — MakomSpace" };
export const dynamic = "force-dynamic";

/** Every review of the organization's spaces, newest first, with the one
 * public reply the landlord may write. A hidden review stays listed here
 * with a note, so the landlord knows why it left the public page. */
export default async function LandlordReviewsPage() {
  const ctx = await requirePageLandlordOrg("landlord:manage_bookings");
  const reviews = await listOrganizationReviews(ctx.activeOrgId);
  const visible = reviews.filter((r) => !r.hiddenAt);
  const average = visible.length
    ? Math.round((visible.reduce((sum, r) => sum + r.rating, 0) / visible.length) * 10) / 10
    : null;
  const unanswered = visible.filter((r) => !r.landlordReply).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Avis clients</h1>
          <p className="text-sm text-muted-foreground">
            Laissés par vos clients après leur réservation. Une réponse courtoise, même à un avis
            mitigé, rassure les prochains clients.
          </p>
        </div>
        {average !== null && <RatingSummary average={average} count={visible.length} size="md" />}
      </div>

      {unanswered > 0 && (
        <p className="rounded-lg bg-muted px-4 py-3 text-sm text-foreground">
          {unanswered === 1 ? "1 avis attend votre réponse." : `${unanswered} avis attendent votre réponse.`}
        </p>
      )}

      {reviews.length === 0 ? (
        <EmptyState
          title="Pas encore d'avis"
          description="Après chaque réservation terminée, le client est invité par e-mail à laisser un avis. Ils apparaîtront ici, et sur la fiche de vos espaces."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map((review) => (
            <Card key={review.id} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">
                    <Link href={`/spaces/${review.space.slug}`} className="hover:underline">
                      {review.space.name}
                    </Link>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {reviewAuthorLabel(review.author)} · {formatDateTime(review.createdAt)}
                  </p>
                </div>
                <p className="flex items-center gap-1">
                  <StarRating value={review.rating} />
                  <span className="sr-only">{review.rating} sur 5</span>
                </p>
              </div>
              {review.comment && (
                <p className="whitespace-pre-line text-sm text-foreground">{review.comment}</p>
              )}
              {review.hiddenAt && (
                <p className="text-xs font-medium text-danger">
                  Masqué par l&apos;équipe MakomSpace : cet avis n&apos;est plus affiché publiquement.
                </p>
              )}
              {review.landlordReply ? (
                <div className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-xs font-medium text-foreground">Votre réponse</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-foreground">{review.landlordReply}</p>
                </div>
              ) : (
                !review.hiddenAt && (
                  <div>
                    <ReviewReplyForm reviewId={review.id} />
                  </div>
                )
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
