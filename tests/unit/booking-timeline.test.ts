import { describe, expect, it } from "vitest";
import { buildBookingTimeline, type TimelineInput } from "@/lib/booking-timeline";

const d = (iso: string) => new Date(iso);
const base = (over: Partial<TimelineInput["booking"]> = {}): TimelineInput["booking"] => ({
  status: "PENDING",
  createdAt: d("2026-11-01T10:00:00Z"),
  startsAt: d("2026-11-10T09:00:00Z"),
  endsAt: d("2026-11-10T13:00:00Z"),
  respondedAt: null,
  cancelledAt: null,
  cancelledBy: null,
  cancellationWindowHours: 48,
  ...over,
});
const authorized = { status: "REQUIRES_CAPTURE", capturedAt: null, amountCents: 10000 };
const input = (over: Partial<TimelineInput>): TimelineInput => ({
  viewer: "client",
  now: d("2026-11-02T10:00:00Z"),
  booking: base(),
  payment: authorized,
  refunds: [],
  payoutLine: null,
  hasReview: false,
  ...over,
});
const keys = (events: ReturnType<typeof buildBookingTimeline>) => events.map((e) => e.key);

describe("buildBookingTimeline", () => {
  it("a pending request: waiting on the host, nothing captured yet", () => {
    const events = buildBookingTimeline(input({}));
    expect(events.find((e) => e.key === "answer")).toMatchObject({ state: "current" });
    expect(keys(events)).not.toContain("captured");
    expect(events.find((e) => e.key === "authorized")?.state).toBe("done");
  });

  it("the landlord is told it is up to them to answer", () => {
    const events = buildBookingTimeline(input({ viewer: "landlord" }));
    expect(events.find((e) => e.key === "answer")?.title).toBe("À vous de répondre");
  });

  it("a confirmed booking shows the acceptance, the capture and the stay still to come", () => {
    const events = buildBookingTimeline(
      input({
        booking: base({ status: "CONFIRMED", respondedAt: d("2026-11-01T12:00:00Z") }),
        payment: { status: "SUCCEEDED", capturedAt: d("2026-11-01T12:00:00Z"), amountCents: 10000 },
      })
    );
    expect(events.find((e) => e.key === "answer")?.state).toBe("done");
    expect(events.find((e) => e.key === "captured")?.state).toBe("done");
    expect(events.find((e) => e.key === "stay")).toMatchObject({ state: "todo", title: "Séjour" });
  });

  it("a refused request is a problem and promises nothing was debited to the tenant", () => {
    const events = buildBookingTimeline(input({ booking: base({ status: "REJECTED", respondedAt: d("2026-11-01T12:00:00Z") }) }));
    const answer = events.find((e) => e.key === "answer");
    expect(answer?.state).toBe("problem");
    expect(answer?.detail).toMatch(/Rien n'a été débité/);
    expect(keys(events)).not.toContain("stay");
  });

  it("a cancellation names who cancelled, depending on who is looking", () => {
    const booking = base({ status: "CANCELLED", respondedAt: d("2026-11-01T12:00:00Z"), cancelledAt: d("2026-11-02T08:00:00Z"), cancelledBy: "CLIENT" });
    const refunds = [{ amountCents: 10000, status: "SUCCEEDED", createdAt: d("2026-11-02T08:00:00Z") }];
    const client = buildBookingTimeline(input({ booking, refunds }));
    const landlord = buildBookingTimeline(input({ booking, refunds, viewer: "landlord" }));
    expect(client.find((e) => e.key === "cancelled")?.title).toBe("Annulée par vous");
    expect(landlord.find((e) => e.key === "cancelled")?.title).toBe("Annulée par le locataire");
    expect(client.find((e) => e.key === "refund-0")?.detail).toBe("Effectué");
  });

  it("only the landlord sees the payout step, and an unpaid one is still to come", () => {
    const payoutLine = { eligibleAt: d("2026-11-11T13:00:00Z"), paidAt: null, amountCents: 8500 };
    const confirmed = base({ status: "CONFIRMED", respondedAt: d("2026-11-01T12:00:00Z") });
    expect(keys(buildBookingTimeline(input({ booking: confirmed, payoutLine })))).not.toContain("payout");
    const landlord = buildBookingTimeline(input({ booking: confirmed, payoutLine, viewer: "landlord" }));
    expect(landlord.find((e) => e.key === "payout")).toMatchObject({ state: "todo", title: "Versement à venir" });
  });

  it("after the stay, the review step appears and turns done once left", () => {
    const booking = base({ status: "CONFIRMED", respondedAt: d("2026-11-01T12:00:00Z") });
    const now = d("2026-11-11T10:00:00Z");
    expect(buildBookingTimeline(input({ booking, now })).find((e) => e.key === "review")?.state).toBe("todo");
    expect(buildBookingTimeline(input({ booking, now, hasReview: true })).find((e) => e.key === "review")?.state).toBe("done");
  });
});
