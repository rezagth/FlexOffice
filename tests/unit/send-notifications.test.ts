import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  message: { findUnique: vi.fn(), findFirst: vi.fn() },
  landlordVerification: { findUnique: vi.fn() },
  space: { findUnique: vi.fn() },
  dispute: { findUnique: vi.fn() },
  payment: { findUnique: vi.fn() },
  spaceReview: { findUnique: vi.fn() },
  booking: { findUnique: vi.fn() },
};
const sendSafely = vi.fn();
const adminAlertRecipients = vi.fn();
const logError = vi.fn();

vi.mock("@/server/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/lib/logger", () => ({ logError, logEvent: vi.fn() }));
vi.mock("@/server/domains/notifications/send-safely", () => ({ sendSafely, adminAlertRecipients }));

const n = await import("@/server/domains/notifications/send-notifications");

const T0 = new Date("2026-11-01T10:00:00Z");
const booking = {
  id: "b1",
  clientUserId: "client-1",
  clientUser: { name: "Alice", email: "alice@x.fr", deletedAt: null },
  organization: { name: "Acme", email: "acme@x.fr" },
  space: { name: "Salle A" },
  startsAt: T0,
  endsAt: T0,
};

beforeEach(() => {
  vi.clearAllMocks();
  sendSafely.mockResolvedValue(true);
  adminAlertRecipients.mockReturnValue([]);
});

describe("meilleur effort : aucune notification ne lève jamais d'exception", () => {
  const calls: Array<[string, () => Promise<void>]> = [
    ["notifyNewMessage", () => n.notifyNewMessage("m")],
    ["notifyVerificationDecision", () => n.notifyVerificationDecision("v", { kind: "APPROVED" })],
    ["notifySpaceModeration", () => n.notifySpaceModeration("s", { kind: "PUBLISHED" })],
    ["notifyDisputeOpened", () => n.notifyDisputeOpened("d")],
    ["notifyDisputeResolved", () => n.notifyDisputeResolved("d", { outcome: "NO_ACTION", notes: "n" })],
    ["notifyRefundIssued", () => n.notifyRefundIssued("p", 100)],
    ["notifyReviewReceived", () => n.notifyReviewReceived("r")],
    ["notifyReviewInvitation", () => n.notifyReviewInvitation("b", 7)],
  ];

  it.each(calls)("%s : une panne de base est journalisée, pas propagée", async (_name, run) => {
    for (const model of Object.values(prismaMock)) {
      for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db down"));
    }
    await expect(run()).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
    expect(sendSafely).not.toHaveBeenCalled();
  });

  it.each(calls)("%s : enregistrement introuvable → aucun e-mail", async (_name, run) => {
    for (const model of Object.values(prismaMock)) {
      for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    }
    await run();
    expect(sendSafely).not.toHaveBeenCalled();
  });
});

describe("notifyNewMessage", () => {
  const message = (over: Record<string, unknown> = {}) => ({
    id: "m2",
    conversationId: "c1",
    senderUserId: "client-1",
    createdAt: T0,
    conversation: { booking },
    ...over,
  });

  it("message du client → e-mail à l'organisation", async () => {
    prismaMock.message.findUnique.mockResolvedValue(message());
    prismaMock.message.findFirst.mockResolvedValue(null);
    await n.notifyNewMessage("m2");
    expect(sendSafely).toHaveBeenCalledTimes(1);
    const built = sendSafely.mock.calls[0][0]();
    expect(built.to).toBe("acme@x.fr");
  });

  it("message de l'hôte → e-mail au client", async () => {
    prismaMock.message.findUnique.mockResolvedValue(message({ senderUserId: "host-1" }));
    prismaMock.message.findFirst.mockResolvedValue(null);
    await n.notifyNewMessage("m2");
    expect(sendSafely.mock.calls[0][0]().to).toBe("alice@x.fr");
  });

  it("rafale du même expéditeur sous 10 minutes → un seul e-mail", async () => {
    prismaMock.message.findUnique.mockResolvedValue(message());
    prismaMock.message.findFirst.mockResolvedValue({
      senderUserId: "client-1",
      createdAt: new Date(T0.getTime() - 60_000),
    });
    await n.notifyNewMessage("m2");
    expect(sendSafely).not.toHaveBeenCalled();
  });

  it("même expéditeur après le délai → nouvel e-mail", async () => {
    prismaMock.message.findUnique.mockResolvedValue(message());
    prismaMock.message.findFirst.mockResolvedValue({
      senderUserId: "client-1",
      createdAt: new Date(T0.getTime() - n.MESSAGE_NOTIFICATION_COOLDOWN_MS - 1),
    });
    await n.notifyNewMessage("m2");
    expect(sendSafely).toHaveBeenCalledTimes(1);
  });

  it("exactement 10 minutes d'écart : le délai est écoulé", async () => {
    prismaMock.message.findUnique.mockResolvedValue(message());
    prismaMock.message.findFirst.mockResolvedValue({
      senderUserId: "client-1",
      createdAt: new Date(T0.getTime() - n.MESSAGE_NOTIFICATION_COOLDOWN_MS),
    });
    await n.notifyNewMessage("m2");
    expect(sendSafely).toHaveBeenCalledTimes(1);
  });

  it("l'interlocuteur a répondu entre-temps → pas de limitation", async () => {
    prismaMock.message.findUnique.mockResolvedValue(message());
    prismaMock.message.findFirst.mockResolvedValue({
      senderUserId: "host-1",
      createdAt: new Date(T0.getTime() - 1000),
    });
    await n.notifyNewMessage("m2");
    expect(sendSafely).toHaveBeenCalledTimes(1);
  });

  it("client supprimé (RGPD) → aucun e-mail", async () => {
    const deleted = { ...booking, clientUser: { ...booking.clientUser, deletedAt: new Date() } };
    prismaMock.message.findUnique.mockResolvedValue(message({ senderUserId: "host-1", conversation: { booking: deleted } }));
    prismaMock.message.findFirst.mockResolvedValue(null);
    await n.notifyNewMessage("m2");
    expect(sendSafely).not.toHaveBeenCalled();
  });

  it("organisation sans adresse e-mail → aucun e-mail", async () => {
    const noMail = { ...booking, organization: { name: "Acme", email: "" } };
    prismaMock.message.findUnique.mockResolvedValue(message({ conversation: { booking: noMail } }));
    prismaMock.message.findFirst.mockResolvedValue(null);
    await n.notifyNewMessage("m2");
    expect(sendSafely).not.toHaveBeenCalled();
  });
});

describe("notifyVerificationDecision", () => {
  beforeEach(() => {
    prismaMock.landlordVerification.findUnique.mockResolvedValue({ organization: { name: "Acme", email: "acme@x.fr" } });
  });

  it("approbation → gabarit « vérifié » à l'organisation", async () => {
    await n.notifyVerificationDecision("v1", { kind: "APPROVED" });
    expect(sendSafely.mock.calls[0][0]().to).toBe("acme@x.fr");
    expect(sendSafely.mock.calls[0][1]).toBe("email.verification_decision.failed");
  });

  it("refus → le motif figure dans le message", async () => {
    await n.notifyVerificationDecision("v1", { kind: "REJECTED", reason: "Kbis illisible" });
    const message = sendSafely.mock.calls[0][0]();
    expect(JSON.stringify(message)).toContain("Kbis illisible");
  });
});

describe("notifySpaceModeration", () => {
  beforeEach(() => {
    prismaMock.space.findUnique.mockResolvedValue({ name: "Salle A", organization: { email: "acme@x.fr" } });
  });

  it.each([
    [{ kind: "PUBLISHED" as const }],
    [{ kind: "REJECTED" as const, reason: "Photos floues" }],
    [{ kind: "REJECTED" as const }],
    [{ kind: "UNPUBLISHED" as const, reason: "Signalement" }],
  ])("décision %j → un e-mail à l'organisation avec le nom de l'espace", async (decision) => {
    await n.notifySpaceModeration("s1", decision);
    const message = sendSafely.mock.calls[0][0]();
    expect(message.to).toBe("acme@x.fr");
    expect(JSON.stringify(message)).toContain("Salle A");
  });
});

describe("notifyDisputeOpened", () => {
  const dispute = (raisedByUserId: string) => ({ id: "d1", raisedByUserId, booking });

  it("prévient les deux parties, sans doublon si elles partagent la même adresse", async () => {
    prismaMock.dispute.findUnique.mockResolvedValue({
      ...dispute("client-1"),
      booking: { ...booking, organization: { name: "Acme", email: "alice@x.fr" } },
    });
    await n.notifyDisputeOpened("d1");
    expect(sendSafely).toHaveBeenCalledTimes(1);
  });

  it("prévient aussi chaque opérateur de la plateforme", async () => {
    prismaMock.dispute.findUnique.mockResolvedValue(dispute("client-1"));
    adminAlertRecipients.mockReturnValue(["ops1@x.fr", "ops2@x.fr"]);
    await n.notifyDisputeOpened("d1");
    expect(sendSafely).toHaveBeenCalledTimes(4);
    const recipients = sendSafely.mock.calls.map((c) => c[0]().to);
    expect(recipients).toEqual(expect.arrayContaining(["alice@x.fr", "acme@x.fr", "ops1@x.fr", "ops2@x.fr"]));
  });

  it("sans adresse d'alerte configurée, seules les parties sont prévenues", async () => {
    prismaMock.dispute.findUnique.mockResolvedValue(dispute("host-1"));
    await n.notifyDisputeOpened("d1");
    expect(sendSafely).toHaveBeenCalledTimes(2);
  });

  it("indique qui a ouvert le litige (client ou hôte)", async () => {
    prismaMock.dispute.findUnique.mockResolvedValue(dispute("client-1"));
    await n.notifyDisputeOpened("d1");
    expect(JSON.stringify(sendSafely.mock.calls[0][0]())).toContain("Alice");
    sendSafely.mockClear();
    prismaMock.dispute.findUnique.mockResolvedValue(dispute("host-1"));
    await n.notifyDisputeOpened("d1");
    expect(JSON.stringify(sendSafely.mock.calls[0][0]())).toContain("Acme");
  });
});

describe("notifyRefundIssued", () => {
  it("écrit au client avec le montant", async () => {
    prismaMock.payment.findUnique.mockResolvedValue({ booking });
    await n.notifyRefundIssued("p1", 4200);
    const message = sendSafely.mock.calls[0][0]();
    expect(message.to).toBe("alice@x.fr");
    expect(JSON.stringify(message)).toMatch(/42/);
  });

  it("client supprimé → aucun e-mail", async () => {
    prismaMock.payment.findUnique.mockResolvedValue({
      booking: { ...booking, clientUser: { ...booking.clientUser, deletedAt: new Date() } },
    });
    await n.notifyRefundIssued("p1", 4200);
    expect(sendSafely).not.toHaveBeenCalled();
  });
});

describe("notifyReviewInvitation / notifyReviewReceived", () => {
  it("invite le client à laisser un avis", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ clientUser: booking.clientUser, space: booking.space });
    await n.notifyReviewInvitation("b1", 14);
    expect(sendSafely.mock.calls[0][0]().to).toBe("alice@x.fr");
  });

  it("client supprimé → pas d'invitation", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      clientUser: { ...booking.clientUser, deletedAt: new Date() },
      space: booking.space,
    });
    await n.notifyReviewInvitation("b1", 14);
    expect(sendSafely).not.toHaveBeenCalled();
  });

  it("prévient l'organisation d'un nouvel avis", async () => {
    prismaMock.spaceReview.findUnique.mockResolvedValue({
      rating: 5,
      organization: { name: "Acme", email: "acme@x.fr" },
      space: { name: "Salle A" },
    });
    await n.notifyReviewReceived("r1");
    expect(sendSafely.mock.calls[0][0]().to).toBe("acme@x.fr");
  });
});

describe("tickets de support", () => {
  it("accusé de réception au demandeur", async () => {
    await n.notifySupportTicketReceived({ id: "t1", email: "visiteur@x.fr" });
    expect(sendSafely.mock.calls[0][0]().to).toBe("visiteur@x.fr");
  });

  it("réponse du support avec son texte", async () => {
    await n.notifySupportReply({ id: "t1", email: "v@x.fr", subject: "Question" }, "Bonjour, voici la réponse.");
    expect(JSON.stringify(sendSafely.mock.calls[0][0]())).toContain("voici la réponse");
  });
});
