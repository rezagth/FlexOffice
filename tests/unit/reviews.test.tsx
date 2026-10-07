// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/server/db/prisma", () => ({ prisma: {} }));

import { reviewAuthorLabel, reviewEligibility, REVIEW_WINDOW_DAYS } from "@/server/domains/reviews/reviews";
import { formatRating, RatingSummary } from "@/components/reviews/star-rating";
import { createReviewSchema, reviewReplySchema } from "@/lib/validation/reviews";

describe("reviewAuthorLabel", () => {
  it("shows a first name and the initial of the last name only", () => {
    expect(reviewAuthorLabel({ name: "Camille Durand", deletedAt: null })).toBe("Camille D.");
    expect(reviewAuthorLabel({ name: "Jean Pierre de la Fontaine", deletedAt: null })).toBe("Jean F.");
    expect(reviewAuthorLabel({ name: "Camille", deletedAt: null })).toBe("Camille");
    expect(reviewAuthorLabel({ name: "   ", deletedAt: null })).toBe("Client");
  });

  it("never shows the name of an erased account", () => {
    expect(reviewAuthorLabel({ name: "Compte supprimé", deletedAt: new Date() })).toBe("Ancien utilisateur");
  });
});

describe("reviewEligibility", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  it("opens when the slot ends and closes after the window", () => {
    expect(reviewEligibility({ status: "CONFIRMED", endsAt: daysAgo(0) }, now)).toBe("ELIGIBLE");
    expect(reviewEligibility({ status: "COMPLETED", endsAt: daysAgo(REVIEW_WINDOW_DAYS) }, now)).toBe("ELIGIBLE");
    expect(reviewEligibility({ status: "COMPLETED", endsAt: daysAgo(REVIEW_WINDOW_DAYS + 0.01) }, now)).toBe(
      "WINDOW_CLOSED"
    );
    expect(reviewEligibility({ status: "REJECTED", endsAt: daysAgo(1) }, now)).toBe("NOT_REVIEWABLE");
  });
});

describe("validation", () => {
  it("requires a whole rating from 1 to 5 and turns an empty comment into none", () => {
    expect(createReviewSchema.parse({ rating: 5, comment: "  " })).toEqual({ rating: 5, comment: null });
    expect(createReviewSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(createReviewSchema.safeParse({ rating: 4.5 }).success).toBe(false);
    expect(createReviewSchema.safeParse({ rating: "5" }).success).toBe(false);
    expect(createReviewSchema.safeParse({ rating: 3, comment: "x".repeat(2001) }).success).toBe(false);
  });

  it("refuses an empty reply", () => {
    expect(reviewReplySchema.safeParse({ reply: "   " }).success).toBe(false);
  });
});

describe("RatingSummary", () => {
  it("formats in French and gives screen readers one sentence", () => {
    expect(formatRating(4.66)).toBe("4,7");
    render(<RatingSummary average={4.5} count={12} />);
    expect(screen.getByText("Note moyenne 4,5 sur 5, 12 avis")).toBeTruthy();
  });
});
