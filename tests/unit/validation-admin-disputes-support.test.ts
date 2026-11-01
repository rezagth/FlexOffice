import { describe, expect, it } from "vitest";
import {
  adminUserSearchSchema,
  optionalReasonSchema,
  requiredReasonSchema,
  supportReplySchema,
} from "@/lib/validation/admin";
import { raiseDisputeSchema, resolveDisputeSchema } from "@/lib/validation/disputes";
import { createTicketSchema } from "@/lib/validation/support";
import { sendMessageSchema } from "@/lib/validation/messages";
import { addFavoriteSchema } from "@/lib/validation/favorites";
import { generateCommissionStatementSchema } from "@/lib/validation/commission-statements";

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const ok = (r: { success: boolean }) => r.success;

describe("requiredReasonSchema", () => {
  it("accepte un motif de 3 à 1000 caractères, rogné", () => {
    const r = requiredReasonSchema.parse({ reason: "  Fraude  " });
    expect(r.reason).toBe("Fraude");
  });
  it.each([undefined, null, "", "  ", "ab", "x".repeat(1001), 42])("refuse %j", (reason) => {
    expect(ok(requiredReasonSchema.safeParse({ reason }))).toBe(false);
  });
  it("accepte exactement 3 et 1000 caractères", () => {
    expect(ok(requiredReasonSchema.safeParse({ reason: "abc" }))).toBe(true);
    expect(ok(requiredReasonSchema.safeParse({ reason: "x".repeat(1000) }))).toBe(true);
  });
  it("ignore les champs en trop sans les propager", () => {
    const r = requiredReasonSchema.parse({ reason: "abc", role: "ADMIN" });
    expect(r).toEqual({ reason: "abc" });
  });
});

describe("optionalReasonSchema", () => {
  it("accepte l'absence de motif et un corps vide", () => {
    expect(ok(optionalReasonSchema.safeParse({}))).toBe(true);
  });
  it("refuse plus de 1000 caractères", () => {
    expect(ok(optionalReasonSchema.safeParse({ reason: "x".repeat(1001) }))).toBe(false);
  });
});

describe("supportReplySchema", () => {
  it("accepte un message avec ou sans clôture", () => {
    expect(ok(supportReplySchema.safeParse({ body: "Bonjour" }))).toBe(true);
    expect(supportReplySchema.parse({ body: "Bonjour", close: true }).close).toBe(true);
  });
  it.each(["", "   ", "x".repeat(5001)])("refuse le message %j", (body) => {
    expect(ok(supportReplySchema.safeParse({ body }))).toBe(false);
  });
  it("close doit être un booléen, pas une chaîne", () => {
    expect(ok(supportReplySchema.safeParse({ body: "a", close: "true" }))).toBe(false);
  });
});

describe("adminUserSearchSchema", () => {
  it("convertit la page en entier", () => {
    expect(adminUserSearchSchema.parse({ page: "3" }).page).toBe(3);
  });
  it.each(["0", "-1", "1.5", "abc", "10001"])("refuse la page %s", (page) => {
    expect(ok(adminUserSearchSchema.safeParse({ page }))).toBe(false);
  });
  it("refuse une recherche de plus de 200 caractères", () => {
    expect(ok(adminUserSearchSchema.safeParse({ q: "x".repeat(201) }))).toBe(false);
  });
});

describe("raiseDisputeSchema", () => {
  it("accepte une description rognée", () => {
    expect(raiseDisputeSchema.parse({ description: "  Salle sale  " }).description).toBe("Salle sale");
  });
  it.each(["", "   ", "x".repeat(2001)])("refuse %j", (description) => {
    expect(ok(raiseDisputeSchema.safeParse({ description }))).toBe(false);
  });
});

describe("resolveDisputeSchema", () => {
  it("remboursement avec montant entier positif", () => {
    expect(ok(resolveDisputeSchema.safeParse({ outcome: "REFUND", notes: "ok", refundAmountCents: 5000 }))).toBe(true);
  });
  it("sans action : montant facultatif", () => {
    expect(ok(resolveDisputeSchema.safeParse({ outcome: "NO_ACTION", notes: "rien" }))).toBe(true);
  });
  it.each([0, -100, 12.5, "5000", Number.NaN])("refuse le montant %j", (refundAmountCents) => {
    expect(ok(resolveDisputeSchema.safeParse({ outcome: "REFUND", notes: "n", refundAmountCents }))).toBe(false);
  });
  it.each(["PARTIAL", "refund", "", undefined])("refuse l'issue %j", (outcome) => {
    expect(ok(resolveDisputeSchema.safeParse({ outcome, notes: "n" }))).toBe(false);
  });
  it("les notes sont obligatoires et bornées", () => {
    expect(ok(resolveDisputeSchema.safeParse({ outcome: "NO_ACTION", notes: "" }))).toBe(false);
    expect(ok(resolveDisputeSchema.safeParse({ outcome: "NO_ACTION", notes: "x".repeat(1001) }))).toBe(false);
  });
});

describe("createTicketSchema", () => {
  const valid = { email: "a@b.fr", subject: "Aide", message: "Bonjour" };
  it("accepte un ticket valide", () => expect(ok(createTicketSchema.safeParse(valid))).toBe(true));
  it.each([
    { ...valid, email: "pas-un-mail" },
    { ...valid, email: "" },
    { ...valid, subject: "" },
    { ...valid, subject: "x".repeat(201) },
    { ...valid, message: "  " },
    { ...valid, message: "x".repeat(4001) },
  ])("refuse %j", (input) => expect(ok(createTicketSchema.safeParse(input))).toBe(false));
});

describe("sendMessageSchema", () => {
  it("rogne et accepte", () => expect(sendMessageSchema.parse({ body: " salut " }).body).toBe("salut"));
  it.each(["", "  ", "x".repeat(4001)])("refuse %j", (body) => expect(ok(sendMessageSchema.safeParse({ body }))).toBe(false));
});

describe("addFavoriteSchema", () => {
  it("accepte un UUID", () => expect(ok(addFavoriteSchema.safeParse({ spaceId: UUID }))).toBe(true));
  it.each(["", "abc", "1", "../x", UUID + "x"])("refuse %j", (spaceId) =>
    expect(ok(addFavoriteSchema.safeParse({ spaceId }))).toBe(false)
  );
  it("n'accepte jamais d'identifiant d'utilisateur (le favori est toujours celui de la session)", () => {
    const parsed = addFavoriteSchema.parse({ spaceId: UUID, userId: "autre" });
    expect(parsed).toEqual({ spaceId: UUID });
  });
});

describe("generateCommissionStatementSchema", () => {
  it.each(["2026-01", "2026-12", "1999-06"])("accepte le mois %s", (month) =>
    expect(ok(generateCommissionStatementSchema.safeParse({ month }))).toBe(true)
  );
  it.each(["2026-00", "2026-13", "2026-1", "26-01", "2026/01", "2026-01-01", "", "janvier"])(
    "refuse le mois %j",
    (month) => expect(ok(generateCommissionStatementSchema.safeParse({ month }))).toBe(false)
  );
  it("l'organisation, si fournie, doit être un UUID", () => {
    expect(ok(generateCommissionStatementSchema.safeParse({ month: "2026-05", organizationId: UUID }))).toBe(true);
    expect(ok(generateCommissionStatementSchema.safeParse({ month: "2026-05", organizationId: "x" }))).toBe(false);
  });
  it("n'accepte jamais de période libre", () => {
    const parsed = generateCommissionStatementSchema.parse({ month: "2026-05", periodStart: "2020-01-01" });
    expect(parsed).not.toHaveProperty("periodStart");
  });
});
