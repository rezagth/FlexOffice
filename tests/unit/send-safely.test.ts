import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
const logError = vi.fn();
vi.mock("@/server/domains/notifications/get-email-provider", () => ({ getEmailProvider: () => ({ send }) }));
vi.mock("@/server/lib/logger", () => ({ logError, logEvent: vi.fn() }));

const { sendSafely, adminAlertRecipients } = await import("@/server/domains/notifications/send-safely");

const message = { to: "a@b.fr", subject: "S", text: "t", html: "<p>t</p>" };

beforeEach(() => vi.clearAllMocks());

describe("sendSafely", () => {
  it("renvoie true quand le fournisseur accepte", async () => {
    send.mockResolvedValue(undefined);
    expect(await sendSafely(() => message, "evt")).toBe(true);
    expect(send).toHaveBeenCalledWith(message);
  });

  it("n'échoue jamais si le fournisseur plante : false + journal d'erreur", async () => {
    send.mockRejectedValue(new Error("resend 500"));
    expect(await sendSafely(() => message, "evt.fail")).toBe(false);
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ event: "evt.fail" }));
  });

  it("un bug de gabarit (construction du message) est journalisé, pas propagé", async () => {
    const result = await sendSafely(() => {
      throw new Error("template bug");
    }, "evt.tpl");
    expect(result).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
  });
});

describe("adminAlertRecipients", () => {
  const original = process.env.ADMIN_ALERT_EMAIL;
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_ALERT_EMAIL;
    else process.env.ADMIN_ALERT_EMAIL = original;
  });

  it("vide ou absent → aucune alerte", () => {
    delete process.env.ADMIN_ALERT_EMAIL;
    expect(adminAlertRecipients()).toEqual([]);
    process.env.ADMIN_ALERT_EMAIL = "";
    expect(adminAlertRecipients()).toEqual([]);
  });

  it("une adresse", () => {
    process.env.ADMIN_ALERT_EMAIL = "ops@makomspace.fr";
    expect(adminAlertRecipients()).toEqual(["ops@makomspace.fr"]);
  });

  it("liste séparée par des virgules, espaces ignorés", () => {
    process.env.ADMIN_ALERT_EMAIL = " a@x.fr , b@x.fr,,  ";
    expect(adminAlertRecipients()).toEqual(["a@x.fr", "b@x.fr"]);
  });

  it("écarte les entrées sans @", () => {
    process.env.ADMIN_ALERT_EMAIL = "pas-une-adresse, ok@x.fr";
    expect(adminAlertRecipients()).toEqual(["ok@x.fr"]);
  });
});
