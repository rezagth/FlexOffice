import { MessageSquareQuote } from "lucide-react";
import type { PublicReview, ReviewSummary } from "@/server/domains/reviews/reviews";
import { RatingSummary, StarRating } from "./star-rating";

function formatReviewDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" });
}

/** The "Avis" section of a public space page. Only real reviews, written by
 * clients after a booking that took place — said in so many words, since an
 * unverifiable review is what the Omnibus rules forbid. */
export function SpaceReviews({
  summary,
  reviews,
  organizationName,
}: {
  summary: ReviewSummary | null;
  reviews: PublicReview[];
  organizationName: string;
}) {
  return (
    <section aria-labelledby="reviews-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="reviews-heading"
          className="flex items-center gap-2 text-base font-semibold text-foreground"
        >
          <MessageSquareQuote aria-hidden="true" className="size-4 text-muted-foreground" />
          Avis des clients
        </h2>
        {summary && summary.count > 0 && <RatingSummary average={summary.average} count={summary.count} />}
      </div>

      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Pas encore d&apos;avis sur cet espace. Les avis sont laissés par des clients après une réservation
          qui a eu lieu.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {reviews.map((review) => (
              <li key={review.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{review.authorLabel}</p>
                  <p className="text-xs text-muted-foreground">{formatReviewDate(review.createdAt)}</p>
                </div>
                <p className="mt-1 flex items-center gap-2">
                  <StarRating value={review.rating} />
                  <span className="sr-only">Note : {review.rating} sur 5</span>
                </p>
                {review.comment && (
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
                    {review.comment}
                  </p>
                )}
                {review.landlordReply && (
                  <div className="mt-3 rounded-lg bg-muted px-3 py-2">
                    <p className="text-xs font-medium text-foreground">Réponse de {organizationName}</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-foreground">{review.landlordReply}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Avis vérifiés : seul un client ayant réservé cet espace sur MakomSpace peut en laisser un, une
            fois la réservation terminée.
          </p>
        </>
      )}
    </section>
  );
}
