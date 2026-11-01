import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  settingsFindUnique,
  settingsUpdate,
  requestCreate,
  requestFindUnique,
  requestUpdate,
  recordAuditMock,
  createInAppNotificationMock,
} = vi.hoisted(() => ({
  settingsFindUnique: vi.fn(),
  settingsUpdate: vi.fn(),
  requestCreate: vi.fn(),
  requestFindUnique: vi.fn(),
  requestUpdate: vi.fn(),
  recordAuditMock: vi.fn(),
  createInAppNotificationMock: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    domiciliationSettings: { findUnique: settingsFindUnique, update: settingsUpdate },
    domiciliationRequest: { create: requestCreate, findUnique: requestFindUnique, update: requestUpdate },
  },
}));
vi.mock("@/server/lib/audit", () => ({ recordAudit: recordAuditMock }));
vi.mock("@/server/domains/notifications/in-app", () => ({
  createInAppNotification: createInAppNotificationMock,
}));

const { isDomiciliationOfferEnabled, setDomiciliationOfferEnabled, createDomiciliationRequest, changeDomiciliationRequestStatus } =
  await import("@/server/domains/organizations/domiciliation");
const { ValidationError } = await import("@/server/lib/errors");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isDomiciliationOfferEnabled", () => {
  it("is false when the settings row says so (the default)", async () => {
    settingsFindUnique.mockResolvedValue({ offerEnabled: false });
    expect(await isDomiciliationOfferEnabled()).toBe(false);
  });

  it("is false if the singleton row is somehow missing — fails closed", async () => {
    settingsFindUnique.mockResolvedValue(null);
    expect(await isDomiciliationOfferEnabled()).toBe(false);
  });

  it("is true once an admin has enabled it", async () => {
    settingsFindUnique.mockResolvedValue({ offerEnabled: true });
    expect(await isDomiciliationOfferEnabled()).toBe(true);
  });
});

describe("setDomiciliationOfferEnabled", () => {
  it("refuses to enable the offer while the licensed domiciliataire is not on file", async () => {
    settingsFindUnique.mockResolvedValue({ domiciliataireName: "Acme Domicil", domiciliataireAgrementNumber: "  " });
    await expect(setDomiciliationOfferEnabled("admin-1", true)).rejects.toBeInstanceOf(ValidationError);
    expect(settingsUpdate).not.toHaveBeenCalled();
  });

  it("always allows switching the offer off, with or without a provider", async () => {
    settingsFindUnique.mockResolvedValue(null);
    await setDomiciliationOfferEnabled("admin-1", false);
    expect(settingsUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ offerEnabled: false }) }));
  });

  it("records who flipped it and when (via recordAudit's own timestamp)", async () => {
    settingsFindUnique.mockResolvedValue({ domiciliataireName: "Acme Domicil", domiciliataireAgrementNumber: "PREF-2026-01" });
    await setDomiciliationOfferEnabled("admin-1", true);
    expect(settingsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ offerEnabled: true, updatedByProfileId: "admin-1" }) })
    );
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "domiciliation.offer_setting_changed", actorUserId: "admin-1" })
    );
  });
});

describe("createDomiciliationRequest", () => {
  it("S11: refuses MAKOMSPACE server-side when the offer is disabled, even if asked for", async () => {
    settingsFindUnique.mockResolvedValue({ offerEnabled: false });
    await expect(
      createDomiciliationRequest({ organizationId: "org-1", actorUserId: "user-1", kind: "MAKOMSPACE" })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(requestCreate).not.toHaveBeenCalled();
  });

  it("accepts MAKOMSPACE when enabled, starting REQUESTED (needs review)", async () => {
    settingsFindUnique.mockResolvedValue({ offerEnabled: true });
    requestCreate.mockResolvedValue({ id: "req-1" });
    await createDomiciliationRequest({ organizationId: "org-1", actorUserId: "user-1", kind: "MAKOMSPACE", contractAccepted: true });
    expect(requestCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "MAKOMSPACE", status: "REQUESTED" }) })
    );
  });

  it("refuses MAKOMSPACE without the acceptance of the domiciliataire's contract", async () => {
    settingsFindUnique.mockResolvedValue({ offerEnabled: true });
    await expect(
      createDomiciliationRequest({ organizationId: "org-1", actorUserId: "user-1", kind: "MAKOMSPACE" })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(requestCreate).not.toHaveBeenCalled();
  });

  it("records the contract acceptance with its version, and only for MAKOMSPACE", async () => {
    settingsFindUnique.mockResolvedValue({ offerEnabled: true });
    requestCreate.mockResolvedValue({ id: "req-1" });
    await createDomiciliationRequest({ organizationId: "org-1", actorUserId: "user-1", kind: "MAKOMSPACE", contractAccepted: true });
    expect(requestCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contractAcceptedAt: expect.any(Date), contractVersion: expect.any(String) }) })
    );
    await createDomiciliationRequest({
      organizationId: "org-1",
      actorUserId: "user-1",
      kind: "THIRD_PARTY",
      domiciliataireName: "X",
      domiciliationAddress: "1 rue",
      domiciliationCity: "Paris",
      domiciliationPostalCode: "75001",
    });
    expect(requestCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contractAcceptedAt: null, contractVersion: null }) })
    );
  });

  it("THIRD_PARTY never needs the offer and starts ACCEPTED immediately (self-declared, nothing to review)", async () => {
    requestCreate.mockResolvedValue({ id: "req-1" });
    await createDomiciliationRequest({
      organizationId: "org-1",
      actorUserId: "user-1",
      kind: "THIRD_PARTY",
      domiciliataireName: "Acme Domiciliation",
      domiciliationAddress: "1 rue de Test",
      domiciliationCity: "Paris",
      domiciliationPostalCode: "75001",
    });
    expect(settingsFindUnique).not.toHaveBeenCalled();
    expect(requestCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "THIRD_PARTY",
          status: "ACCEPTED",
          domiciliataireName: "Acme Domiciliation",
          address: "1 rue de Test",
        }),
      })
    );
  });
});

describe("changeDomiciliationRequestStatus", () => {
  it("updates the row and notifies the requester in-app, without the full detail of a company or in-app notification revealing anything private", async () => {
    requestFindUnique.mockResolvedValue({
      id: "req-1",
      organizationId: "org-1",
      requestedByProfileId: "profile-1",
      adminNotes: null,
    });
    requestUpdate.mockResolvedValue({ id: "req-1", status: "ACCEPTED" });

    await changeDomiciliationRequestStatus("admin-1", "req-1", "ACCEPTED", "Dossier complet");

    expect(requestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ACCEPTED", adminNotes: "Dossier complet", reviewedByProfileId: "admin-1" }),
      })
    );
    expect(createInAppNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientProfileId: "profile-1", type: "DOMICILIATION_STATUS_CHANGED" })
    );
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "domiciliation.status_changed", actorUserId: "admin-1" })
    );
  });
});
