import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
const applyPaymentOutcomeMock = vi.fn();
const recordDisputeEventMock = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: { webhookEvent: { create: createMock } },
}));

vi.mock("@/server/domains/payments/apply-outcome", () => ({
  applyPaymentOutcome: applyPaymentOutcomeMock,
}));

vi.mock("@/server/domains/payments/disputes", () => ({
  recordDisputeEvent: recordDisputeEventMock,
}));

process.env.PAYMENT_PROVIDER = "mock";
process.env.PAYMENT_MOCK_WEBHOOK_SECRET = "test-secret";

const { POST } = await import("@/app/api/webhooks/stripe/route");

function webhookRequest(body: unknown, signature = "test-secret") {
  return new Request("http://test.local/api/webhooks/stripe", {
    method: "POST",
    headers: { "x-mock-signature": signature },
    body: JSON.stringify(body),
  });
}

const DISPUTE_DATA = {
  id: "dp_1",
  payment_intent: "pi_abc",
  amount: 1500,
  reason: "fraudulent",
  status: "warning_needs_response",
};

beforeEach(() => {
  createMock.mockReset().mockResolvedValue({});
  applyPaymentOutcomeMock.mockReset().mockResolvedValue(undefined);
  recordDisputeEventMock.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/webhooks/stripe — dispute events", () => {
  it("routes charge.dispute.created to recordDisputeEvent, not applyPaymentOutcome", async () => {
    const res = await POST(
      webhookRequest({ id: "evt_1", type: "charge.dispute.created", data: DISPUTE_DATA })
    );
    expect(res.status).toBe(200);
    expect(recordDisputeEventMock).toHaveBeenCalledWith(DISPUTE_DATA);
    expect(applyPaymentOutcomeMock).not.toHaveBeenCalled();
  });

  it("routes charge.dispute.updated and charge.dispute.closed the same way", async () => {
    await POST(webhookRequest({ id: "evt_2", type: "charge.dispute.updated", data: DISPUTE_DATA }));
    await POST(webhookRequest({ id: "evt_3", type: "charge.dispute.closed", data: DISPUTE_DATA }));
    expect(recordDisputeEventMock).toHaveBeenCalledTimes(2);
  });

  it("a replayed dispute event (duplicate providerEventId) is a safe no-op, still dispatched", async () => {
    const uniqueViolation = Object.assign(new Error("duplicate"), {
      code: "P2002",
      name: "PrismaClientKnownRequestError",
    });
    const { Prisma } = await import("@/generated/prisma/client");
    Object.setPrototypeOf(uniqueViolation, Prisma.PrismaClientKnownRequestError.prototype);
    createMock.mockRejectedValueOnce(uniqueViolation);

    const res = await POST(
      webhookRequest({ id: "evt_4", type: "charge.dispute.created", data: DISPUTE_DATA })
    );
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    // recordDisputeEvent itself is idempotent (upsert by providerDisputeId),
    // so dispatching it again on a replayed webhook delivery is safe.
    expect(recordDisputeEventMock).toHaveBeenCalledWith(DISPUTE_DATA);
  });

  it("a malformed dispute payload is logged and ignored, not thrown", async () => {
    const res = await POST(
      webhookRequest({ id: "evt_5", type: "charge.dispute.created", data: { foo: "bar" } })
    );
    expect(res.status).toBe(200);
    expect(recordDisputeEventMock).not.toHaveBeenCalled();
  });

  it("unrelated event types are still ignored, not routed to dispute handling", async () => {
    const res = await POST(webhookRequest({ id: "evt_6", type: "customer.created", data: {} }));
    expect(res.status).toBe(200);
    expect(recordDisputeEventMock).not.toHaveBeenCalled();
    expect(applyPaymentOutcomeMock).not.toHaveBeenCalled();
  });
});
