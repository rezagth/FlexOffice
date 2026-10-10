import { describe, expect, it } from "vitest";
import {
  DISPUTE_STATUS_RANK,
  statusesThatMayMoveTo,
  stripeDashboardDisputeUrl,
} from "@/server/domains/payments/disputes";

/** FCT-21 / SEC-17 — Stripe delivers dispute events in any order; a stored
 * status is never replaced by an earlier or equal stage. */
describe("Stripe dispute status ordering", () => {
  it("a final outcome is never overwritten", () => {
    for (const final of ["WON", "LOST", "CHARGE_REFUNDED", "WARNING_CLOSED"] as const) {
      for (const next of Object.keys(DISPUTE_STATUS_RANK) as (keyof typeof DISPUTE_STATUS_RANK)[]) {
        expect(statusesThatMayMoveTo(next)).not.toContain(final);
      }
    }
  });

  it("a late needs_response does not reopen an under_review dispute", () => {
    expect(statusesThatMayMoveTo("NEEDS_RESPONSE")).not.toContain("UNDER_REVIEW");
  });

  it("moves forward: needs_response -> under_review -> won", () => {
    expect(statusesThatMayMoveTo("UNDER_REVIEW")).toContain("NEEDS_RESPONSE");
    expect(statusesThatMayMoveTo("WON")).toEqual(
      expect.arrayContaining(["NEEDS_RESPONSE", "UNDER_REVIEW", "WARNING_NEEDS_RESPONSE"])
    );
  });

  it("an inquiry may escalate to a chargeback", () => {
    expect(statusesThatMayMoveTo("NEEDS_RESPONSE")).toEqual(
      expect.arrayContaining(["WARNING_NEEDS_RESPONSE", "WARNING_UNDER_REVIEW"])
    );
  });

  it("links to the Stripe dashboard in the key's mode", () => {
    const previous = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    expect(stripeDashboardDisputeUrl("dp_1")).toBe("https://dashboard.stripe.com/test/disputes/dp_1");
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    expect(stripeDashboardDisputeUrl("dp_1")).toBe("https://dashboard.stripe.com/disputes/dp_1");
    process.env.STRIPE_SECRET_KEY = previous;
  });
});
