import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level guards of lot C: SEC-13 (capabilities on landlord routes),
 * SEC-19 (KYC viewing traced), FCT-21 (account.updated dispatched).
 */
const requireCapabilityMock = vi.fn();
const requireAdminMock = vi.fn();
const acceptMock = vi.fn();
const documentFindFirst = vi.fn();
const recordAuditMock = vi.fn();
const signedUrlMock = vi.fn();
const recordConnectMock = vi.fn();

vi.mock("@/server/auth/rbac", () => ({
  requireCapability: requireCapabilityMock,
  requireAdmin: requireAdminMock,
  requireOrg: vi.fn(),
}));
vi.mock("@/server/domains/bookings/accept-reject", () => ({
  acceptBookingRequest: acceptMock,
  rejectBookingRequest: acceptMock,
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    verificationDocument: { findFirst: documentFindFirst },
    webhookEvent: { create: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock("@/server/lib/audit", () => ({ recordAudit: recordAuditMock }));
vi.mock("@/server/domains/verification/storage", () => ({ createSignedDocumentUrl: signedUrlMock }));
vi.mock("@/server/domains/payments/stripe-connect", () => ({
  isConnectAccountEventData: (d: { id?: string }) => typeof d?.id === "string" && d.id.startsWith("acct_"),
  recordConnectAccountUpdate: recordConnectMock,
}));

process.env.PAYMENT_PROVIDER = "mock";
process.env.PAYMENT_MOCK_WEBHOOK_SECRET = "test-secret";

const { ForbiddenError } = await import("@/server/lib/errors");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const params = (p: Record<string, string>): any => ({ params: Promise.resolve(p) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SEC-13 — landlord routes ask for the real capability", () => {
  it("accepting a booking requires landlord:manage_bookings (a VIEWER is refused)", async () => {
    const { POST } = await import("@/app/api/partner/bookings/[id]/accept/route");
    requireCapabilityMock.mockRejectedValue(new ForbiddenError());
    const res = await POST(new Request("http://test.local/x", { method: "POST" }), params({ id: "b1" }));
    expect(res.status).toBe(403);
    expect(requireCapabilityMock).toHaveBeenCalledWith("landlord:manage_bookings");
    expect(acceptMock).not.toHaveBeenCalled();
  });

  it("scopes the action to the active organization of the session", async () => {
    const { POST } = await import("@/app/api/partner/bookings/[id]/accept/route");
    requireCapabilityMock.mockResolvedValue({ userId: "u1", activeOrgId: "org-1" });
    acceptMock.mockResolvedValue({ status: "CONFIRMED" });
    const res = await POST(new Request("http://test.local/x", { method: "POST" }), params({ id: "b1" }));
    expect(res.status).toBe(200);
    expect(acceptMock).toHaveBeenCalledWith("org-1", "b1");
  });

  it.each([
    ["@/app/api/partner/spaces/[id]/closures/route", "POST", "landlord:manage_calendar"],
    ["@/app/api/partner/spaces/[id]/opening-hours/route", "PUT", "landlord:manage_calendar"],
    ["@/app/api/partner/spaces/[id]/route", "PATCH", "landlord:manage_spaces"],
    ["@/app/api/partner/spaces/[id]/submit/route", "POST", "landlord:publish_listing"],
    ["@/app/api/partner/spaces/route", "POST", "landlord:manage_spaces"],
  ])("%s %s requires %s", async (path, method, capability) => {
    const mod = (await import(/* @vite-ignore */ path)) as Record<string, (r: Request, c: unknown) => Promise<Response>>;
    requireCapabilityMock.mockRejectedValue(new ForbiddenError());
    const res = await mod[method](
      new Request("http://test.local/x", { method, headers: { "Content-Type": "application/json" }, body: "{}" }),
      params({ id: "s1" })
    );
    expect(res.status).toBe(403);
    expect(requireCapabilityMock).toHaveBeenCalledWith(capability);
  });
});

describe("SEC-19 — an admin viewing a KYC document is traced", () => {
  it("records the viewing before handing out the signed URL", async () => {
    const { GET } = await import("@/app/api/admin/verifications/[id]/documents/[documentId]/route");
    requireAdminMock.mockResolvedValue({ userId: "admin-1" });
    documentFindFirst.mockResolvedValue({
      id: "d1",
      type: "IDENTITY_DOCUMENT",
      storagePath: "x/y.pdf",
      verification: { organizationId: "org-1" },
    });
    signedUrlMock.mockResolvedValue("https://signed");
    const res = await GET(new Request("http://test.local/x"), params({ id: "v1", documentId: "d1" }));
    expect(res.status).toBe(200);
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "verification.document_viewed",
        actorUserId: "admin-1",
        organizationId: "org-1",
        metadata: expect.objectContaining({ documentId: "d1", verificationId: "v1" }),
      })
    );
    expect(recordAuditMock.mock.invocationCallOrder[0]).toBeLessThan(signedUrlMock.mock.invocationCallOrder[0]);
  });

  it("hands out nothing if the trace cannot be written", async () => {
    const { GET } = await import("@/app/api/admin/verifications/[id]/documents/[documentId]/route");
    requireAdminMock.mockResolvedValue({ userId: "admin-1" });
    documentFindFirst.mockResolvedValue({ id: "d1", type: "K_BIS", storagePath: "p", verification: { organizationId: "o" } });
    recordAuditMock.mockRejectedValue(new Error("db down"));
    const res = await GET(new Request("http://test.local/x"), params({ id: "v1", documentId: "d1" }));
    expect(res.status).toBe(500);
    expect(signedUrlMock).not.toHaveBeenCalled();
  });
});

describe("FCT-21 — account.updated webhook", () => {
  it("is routed to the Connect journal", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const data = { id: "acct_1", charges_enabled: true, payouts_enabled: false };
    const res = await POST(
      new Request("http://test.local/api/webhooks/stripe", {
        method: "POST",
        headers: { "x-mock-signature": "test-secret" },
        body: JSON.stringify({ id: "evt_acct", type: "account.updated", data }),
      })
    );
    expect(res.status).toBe(200);
    expect(recordConnectMock).toHaveBeenCalledWith(data);
  });
});
