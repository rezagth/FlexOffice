import { describe, expect, it } from "vitest";
import {
  adminSetVerifiedPhoneSchema,
  confirmPhoneCodeSchema,
  requestPhoneCodeSchema,
  smsPhoneSchema,
} from "@/lib/validation/phone-verification";
import { createReviewSchema, hideReviewSchema, reviewReplySchema, REVIEW_TEXT_MAX } from "@/lib/validation/reviews";
import { taxInfoSchema } from "@/lib/validation/tax-info";
import { createReportSchema, CONTENT_REPORT_REASON_LABELS } from "@/lib/validation/reports";
import { rejectVerificationSchema, uploadDocumentSchema } from "@/lib/validation/verification";

const ok = (r: { success: boolean }) => r.success;

describe("smsPhoneSchema", () => {
  it.each([
    ["06 12 34 56 78", "0612345678"],
    ["06.12.34.56.78", "0612345678"],
    ["06-12-34-56-78", "0612345678"],
    ["+33 6 12 34 56 78", "+33612345678"],
    ["(06) 12 34 56 78", "0612345678"],
    ["  0612345678  ", "0612345678"],
  ])("normalise %j → %s", (input, expected) => {
    expect(smsPhoneSchema.parse(input)).toBe(expected);
  });
  it.each(["", "abc", "12345", "+", "0612345678901234", "06 12 34 5x 78", "++33612345678", "06123456789 ; DROP"])(
    "refuse %j",
    (input) => expect(ok(smsPhoneSchema.safeParse(input))).toBe(false)
  );
  it("accepte exactement 6 et 15 chiffres", () => {
    expect(ok(smsPhoneSchema.safeParse("123456"))).toBe(true);
    expect(ok(smsPhoneSchema.safeParse("123456789012345"))).toBe(true);
    expect(ok(smsPhoneSchema.safeParse("1234567890123456"))).toBe(false);
  });
  it("requestPhoneCodeSchema normalise aussi", () => {
    expect(requestPhoneCodeSchema.parse({ newPhone: "06 12 34 56 78" }).newPhone).toBe("0612345678");
  });
});

describe("confirmPhoneCodeSchema", () => {
  it("accepte 6 chiffres (rognés)", () => expect(confirmPhoneCodeSchema.parse({ code: " 123456 " }).code).toBe("123456"));
  it.each(["", "12345", "1234567", "12345a", "12 3456", "١٢٣٤٥٦", "123456\n123456"])("refuse %j", (code) =>
    expect(ok(confirmPhoneCodeSchema.safeParse({ code }))).toBe(false)
  );
  it("refuse un nombre au lieu d'une chaîne", () => {
    expect(ok(confirmPhoneCodeSchema.safeParse({ code: 123456 }))).toBe(false);
  });
});

describe("adminSetVerifiedPhoneSchema", () => {
  it("exige un numéro valide ET un motif", () => {
    expect(ok(adminSetVerifiedPhoneSchema.safeParse({ newPhone: "0612345678", reason: "Ancien numéro perdu" }))).toBe(true);
    expect(ok(adminSetVerifiedPhoneSchema.safeParse({ newPhone: "0612345678" }))).toBe(false);
    expect(ok(adminSetVerifiedPhoneSchema.safeParse({ newPhone: "x", reason: "Motif ok" }))).toBe(false);
    expect(ok(adminSetVerifiedPhoneSchema.safeParse({ newPhone: "0612345678", reason: "ab" }))).toBe(false);
  });
});

describe("createReviewSchema", () => {
  it.each([1, 2, 3, 4, 5])("accepte la note %i", (rating) => expect(ok(createReviewSchema.safeParse({ rating }))).toBe(true));
  it.each([0, 6, -1, 3.5, "5", null, undefined, Number.NaN])("refuse la note %j", (rating) =>
    expect(ok(createReviewSchema.safeParse({ rating }))).toBe(false)
  );
  it("un commentaire vide devient null", () => {
    expect(createReviewSchema.parse({ rating: 5, comment: "   " }).comment).toBeNull();
    expect(createReviewSchema.parse({ rating: 5 }).comment).toBeNull();
  });
  it("rogne le commentaire et refuse l'excès", () => {
    expect(createReviewSchema.parse({ rating: 5, comment: "  top  " }).comment).toBe("top");
    expect(ok(createReviewSchema.safeParse({ rating: 5, comment: "x".repeat(REVIEW_TEXT_MAX + 1) }))).toBe(false);
    expect(ok(createReviewSchema.safeParse({ rating: 5, comment: "x".repeat(REVIEW_TEXT_MAX) }))).toBe(true);
  });
});

describe("reviewReplySchema / hideReviewSchema", () => {
  it("la réponse du bailleur est obligatoire et bornée", () => {
    expect(ok(reviewReplySchema.safeParse({ reply: "Merci !" }))).toBe(true);
    expect(ok(reviewReplySchema.safeParse({ reply: "  " }))).toBe(false);
    expect(ok(reviewReplySchema.safeParse({ reply: "x".repeat(REVIEW_TEXT_MAX + 1) }))).toBe(false);
  });
  it("masquer un avis exige un motif de 3 à 500 caractères", () => {
    expect(ok(hideReviewSchema.safeParse({ reason: "Injurieux" }))).toBe(true);
    expect(ok(hideReviewSchema.safeParse({ reason: "ab" }))).toBe(false);
    expect(ok(hideReviewSchema.safeParse({ reason: "x".repeat(501) }))).toBe(false);
  });
});

describe("taxInfoSchema (DAC7)", () => {
  it("normalise le pays en majuscules", () => {
    expect(taxInfoSchema.parse({ taxResidenceCountry: " fr " }).taxResidenceCountry).toBe("FR");
  });
  it.each(["", "F", "FRA", "F1", "12", "é"])("refuse le pays %j", (taxResidenceCountry) =>
    expect(ok(taxInfoSchema.safeParse({ taxResidenceCountry }))).toBe(false)
  );
  it("le pays est obligatoire", () => expect(ok(taxInfoSchema.safeParse({}))).toBe(false));
  it("numéro fiscal de 3 à 40 caractères", () => {
    expect(ok(taxInfoSchema.safeParse({ taxResidenceCountry: "FR", taxIdentificationNumber: "ab" }))).toBe(false);
    expect(ok(taxInfoSchema.safeParse({ taxResidenceCountry: "FR", taxIdentificationNumber: "abc" }))).toBe(true);
    expect(ok(taxInfoSchema.safeParse({ taxResidenceCountry: "FR", taxIdentificationNumber: "x".repeat(41) }))).toBe(false);
  });
  it.each(["1985-07-04", "2000-02-29"])("accepte la date %s", (representativeBirthDate) =>
    expect(ok(taxInfoSchema.safeParse({ taxResidenceCountry: "FR", representativeBirthDate }))).toBe(true)
  );
  it.each(["04/07/1985", "1985-13-01", "1985-02-30", "1900-02-29", "demain", "1985-7-4"])("refuse la date %s", (representativeBirthDate) =>
    expect(ok(taxInfoSchema.safeParse({ taxResidenceCountry: "FR", representativeBirthDate }))).toBe(false)
  );
});

describe("createReportSchema (signalement)", () => {
  const valid = { reason: "ILLEGAL", message: "Annonce frauduleuse, voir détails." };
  it("accepte un signalement valide, e-mail facultatif", () => {
    expect(ok(createReportSchema.safeParse(valid))).toBe(true);
    expect(ok(createReportSchema.safeParse({ ...valid, email: "a@b.fr" }))).toBe(true);
  });
  it("tous les motifs affichés dans l'interface sont acceptés par le schéma", () => {
    for (const reason of Object.keys(CONTENT_REPORT_REASON_LABELS)) {
      expect(ok(createReportSchema.safeParse({ ...valid, reason }))).toBe(true);
    }
  });
  it.each(["", "SPAM", "illegal", undefined])("refuse le motif %j", (reason) =>
    expect(ok(createReportSchema.safeParse({ ...valid, reason }))).toBe(false)
  );
  it("exige 10 caractères minimum (rognés) et 3000 maximum", () => {
    expect(ok(createReportSchema.safeParse({ ...valid, message: "123456789" }))).toBe(false);
    expect(ok(createReportSchema.safeParse({ ...valid, message: "         123456789   " }))).toBe(false);
    expect(ok(createReportSchema.safeParse({ ...valid, message: "1234567890" }))).toBe(true);
    expect(ok(createReportSchema.safeParse({ ...valid, message: "x".repeat(3001) }))).toBe(false);
  });
  it("refuse un e-mail invalide", () => {
    expect(ok(createReportSchema.safeParse({ ...valid, email: "pas-un-mail" }))).toBe(false);
  });
});

describe("vérification du bailleur", () => {
  it.each(["IDENTITY_DOCUMENT", "OWNERSHIP_PROOF", "K_BIS", "VAT_PROOF", "LEGAL_REPRESENTATIVE_ID", "SUBLEASE_AUTHORIZATION", "OTHER"])(
    "accepte le type de document %s",
    (type) => expect(ok(uploadDocumentSchema.safeParse({ type }))).toBe(true)
  );
  it.each(["", "PASSPORT", "k_bis", "../../etc/passwd", undefined])("refuse le type de document %j", (type) =>
    expect(ok(uploadDocumentSchema.safeParse({ type }))).toBe(false)
  );
  it("un refus de dossier exige un motif non vide, borné à 1000", () => {
    expect(ok(rejectVerificationSchema.safeParse({ reason: "Kbis périmé" }))).toBe(true);
    expect(ok(rejectVerificationSchema.safeParse({ reason: "  " }))).toBe(false);
    expect(ok(rejectVerificationSchema.safeParse({ reason: "x".repeat(1001) }))).toBe(false);
  });
});
