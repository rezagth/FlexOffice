import { z } from "zod";

/**
 * Which slot an uploaded document fills. Validated against the enum so an
 * arbitrary string can never reach the database — Zod, not the browser's
 * <select>, is what actually constrains this.
 */
export const verificationDocumentTypeSchema = z.enum([
  "IDENTITY_DOCUMENT",
  "OWNERSHIP_PROOF",
  "K_BIS",
  "VAT_PROOF",
  "LEGAL_REPRESENTATIVE_ID",
  "SUBLEASE_AUTHORIZATION",
  "OTHER",
]);

/** The `type` field alongside a multipart file upload. */
export const uploadDocumentSchema = z.object({
  type: verificationDocumentTypeSchema,
});

/**
 * An admin's rejection reason. Required and bounded — enforced here AND by
 * `landlord_verifications_rejection_reason_check` in the database, so a
 * rejection with no explanation cannot happen through this route or through
 * a direct write.
 */
export const rejectVerificationSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type RejectVerificationInput = z.infer<typeof rejectVerificationSchema>;
