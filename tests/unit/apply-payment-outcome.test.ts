import { beforeEach, describe, expect, it, vi } from "vitest";

const paymentFindUnique = vi.fn();
const paymentUpdateMany = vi.fn();
const bookingUpdateMany = vi.fn();
const auditCreate = vi.fn();
const emailSend = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    payment: { findUnique: paymentFindUnique, updateMany: paymentUpdateMany },
    booking: { updateMany: bookingUpdateMany },
    auditLog: { create: auditCreate },
  },
}));

vi.mock("@/server/domains/notifications/get-email-provider", () => ({
  getEmailProvider: () => ({ name: "test", send: emailSend }),
}));

const { applyPaymentOutcome } = await import("@/server/domains/payments/apply-outcome");

const PAYMENT = {
  id: "pay-1",
  bookingId: "book-1",
  organizationId: "org-1",
  providerPaymentIntentId: "mock_pi_1",
  booking: {
    id: "book-1",
    startsAt: new Date("2030-03-04T09:00:00Z"),
    endsAt: new Date("2030-03-04T12:00:00Z"),
    priceAmountCents: 9000,
    space: {
      name: "Salle Rivoli",
      address: "12 rue de Rivoli",
      city: "Paris",
      postalCode: "75004",
      accessInstructions: "Code 1234",
    },
    organization: { name: "Atelier Partners", email: "partner@test.local" },
    clientUser: { name: "Sam Client", email: "client@test.local" },
  },
};

beforeEach(() => {
  paymentFindUnique.mockReset().mockResolvedValue(PAYMENT);
  paymentUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  bookingUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  auditCreate.mockReset().mockResolvedValue({});
  emailSend.mockReset().mockResolvedValue({ id: "email-1" });
});

describe("applyPaymentOutcome", () => {
  it("confirms the booking and captures the payment on a captured outcome", async () => {
    await applyPaymentOutcome("mock_pi_1", "captured");

    expect(paymentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pay-1", status: "REQUIRES_CAPTURE" },
        data: expect.objectContaining({ status: "SUCCEEDED" }),
      })
    );
    expect(bookingUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "book-1", status: "PENDING" },
        data: { status: "CONFIRMED" },
      })
    );
    expect(emailSend).toHaveBeenCalledTimes(1);
  });

  it("rejects the booking and fails the payment on a canceled outcome", async () => {
    await applyPaymentOutcome("mock_pi_1", "canceled");

    expect(paymentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
    expect(bookingUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REJECTED" } })
    );
  });

  it("is a no-op the second time — a replayed event must not double-apply", async () => {
    // The conditional update matched nothing: the payment already moved
    // out of REQUIRES_CAPTURE on the first delivery.
    paymentUpdateMany.mockResolvedValue({ count: 0 });

    await applyPaymentOutcome("mock_pi_1", "captured");

    expect(bookingUpdateMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("ignores an intent this app never created, without throwing", async () => {
    paymentFindUnique.mockResolvedValue(null);
    await expect(applyPaymentOutcome("pi_unknown", "captured")).resolves.toBeUndefined();
    expect(paymentUpdateMany).not.toHaveBeenCalled();
  });

  it("does not fail the transition when the email provider throws", async () => {
    emailSend.mockRejectedValue(new Error("smtp down"));
    await expect(applyPaymentOutcome("mock_pi_1", "captured")).resolves.toBeUndefined();
    expect(bookingUpdateMany).toHaveBeenCalled();
  });
});
