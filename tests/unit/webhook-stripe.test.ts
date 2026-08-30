import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
const applyPaymentOutcomeMock = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: { webhookEvent: { create: createMock } },
}));

vi.mock("@/server/domains/payments/apply-outcome", () => ({
  applyPaymentOutcome: applyPaymentOutcomeMock,
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

beforeEach(() => {
  createMock.mockReset();
  applyPaymentOutcomeMock.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/webhooks/stripe", () => {
  it("rejects a request with an invalid signature — 400, not 500", async () => {
    const res = await POST(webhookRequest({ id: "evt_1", type: "payment.succeeded" }, "wrong"));
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
    // An unverified payload must never move money or booking state.
    expect(applyPaymentOutcomeMock).not.toHaveBeenCalled();
  });

  it("stores a valid event and returns 200", async () => {
    createMock.mockResolvedValue({});
    const res = await POST(webhookRequest({ id: "evt_2", type: "payment.succeeded" }));
    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ providerEventId: "evt_2" }),
      })
    );
  });

  it("treats a duplicate provider event id as a safe no-op, not an error", async () => {
    const uniqueViolation = Object.assign(new Error("duplicate"), {
      code: "P2002",
      name: "PrismaClientKnownRequestError",
    });
    // Match the shape `instanceof Prisma.PrismaClientKnownRequestError` checks for.
    const { Prisma } = await import("@/generated/prisma/client");
    Object.setPrototypeOf(uniqueViolation, Prisma.PrismaClientKnownRequestError.prototype);
    createMock.mockRejectedValue(uniqueViolation);

    const res = await POST(webhookRequest({ id: "evt_3", type: "payment.succeeded" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
  });

  it("applies a verified payment_intent.succeeded to the booking", async () => {
    createMock.mockResolvedValue({});
    const res = await POST(
      webhookRequest({
        id: "evt_4",
        type: "payment_intent.succeeded",
        data: { id: "pi_abc" },
      })
    );
    expect(res.status).toBe(200);
    expect(applyPaymentOutcomeMock).toHaveBeenCalledWith("pi_abc", "captured");
  });

  it("maps payment_intent.canceled to a canceled outcome", async () => {
    createMock.mockResolvedValue({});
    await POST(
      webhookRequest({ id: "evt_5", type: "payment_intent.canceled", data: { id: "pi_def" } })
    );
    expect(applyPaymentOutcomeMock).toHaveBeenCalledWith("pi_def", "canceled");
  });

  it("ignores an event type it does not handle", async () => {
    createMock.mockResolvedValue({});
    const res = await POST(webhookRequest({ id: "evt_6", type: "customer.created", data: {} }));
    expect(res.status).toBe(200);
    expect(applyPaymentOutcomeMock).not.toHaveBeenCalled();
  });
});
