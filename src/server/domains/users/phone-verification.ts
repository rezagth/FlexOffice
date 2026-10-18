import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { ConflictError, ServiceUnavailableError, ValidationError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { logError, logEvent } from "@/server/lib/logger";
import { getSmsProvider } from "@/server/domains/sms/get-sms-provider";
import { maskPhone } from "@/server/domains/sms/mask-phone";
import { createInAppNotification } from "@/server/domains/notifications/in-app";

/**
 * PRD V1.1, 2B, R25-R30/R47/R51 — phone verification by a 6-digit, 10-minute,
 * single-use, 5-attempt code.
 *
 * Two flows, not one:
 *  - INITIAL_VERIFICATION (no verified phone yet): the code goes to the
 *    candidate number itself.
 *  - NUMBER_CHANGE (already has one): the code goes to the CURRENT, already
 *    verified number — proving you still control it is what authorizes the
 *    switch — and on success the NEW number is marked verified directly,
 *    with no second code sent to it (R51).
 *
 * Confirmation always targets the single most recent code row for the
 * profile, regardless of older rows: requesting a new code makes any
 * earlier one permanently unreachable (it is simply never looked up again),
 * without needing to touch or invalidate it.
 */

const CODE_LENGTH = 6;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const VERIFIED_PHONE_UNIQUE_CONSTRAINT = "profiles_verified_phone_unique";

function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

// A 6-digit code is a 1,000,000-value space: no hash makes it resistant to
// brute force against a stolen database, salted or not — the real
// protections are the 10-minute expiry, single use, and the 5-attempt
// lockout enforced by THIS code, none of which a database dump bypasses.
// Hashing it still matters for a narrower reason: a live code is never
// sitting in the database in cleartext for a casual read (a support query,
// a backup, a replica) to pick up and use within its 10-minute window.
function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function codeMatches(entered: string, storedHash: string): boolean {
  const enteredHash = Buffer.from(hashCode(entered), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return enteredHash.length === stored.length && timingSafeEqual(enteredHash, stored);
}

/** Exported for admin/users.ts's support-assisted path, which writes
 * `phone`/`phoneVerifiedAt` directly rather than through the code flow. */
export function isDuplicateVerifiedPhone(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    typeof error.message === "string" &&
    error.message.includes(VERIFIED_PHONE_UNIQUE_CONSTRAINT)
  );
}

export type RequestPhoneCodeResult = {
  purpose: "INITIAL_VERIFICATION" | "NUMBER_CHANGE";
  sentToMasked: string;
};

/** `candidatePhone` is already validated and normalized by the caller (see
 * lib/validation/phone-verification.ts) — this trusts its shape, same as
 * createBooking() trusts CreateBookingInput. */
export async function requestPhoneVerificationCode(
  profileId: string,
  candidatePhone: string
): Promise<RequestPhoneCodeResult> {
  let provider;
  try {
    provider = getSmsProvider();
  } catch (error) {
    logError({ event: "sms.provider_refused", error });
    throw new ServiceUnavailableError("L'envoi de code par SMS est momentanément indisponible.");
  }

  const profile = await prisma.profile.findUniqueOrThrow({
    where: { id: profileId },
    select: { phone: true, phoneVerifiedAt: true },
  });

  const purpose = profile.phoneVerifiedAt ? ("NUMBER_CHANGE" as const) : ("INITIAL_VERIFICATION" as const);

  if (purpose === "NUMBER_CHANGE") {
    if (!profile.phone) {
      // Invariant violation (phoneVerifiedAt implies phone) — should be
      // unreachable; fail loudly rather than send a code nobody can use.
      logEvent({ event: "phone_verification.invariant_violated", profile_id: profileId });
      throw new ServiceUnavailableError("La vérification du téléphone est momentanément indisponible.");
    }
    if (candidatePhone === profile.phone) {
      throw new ValidationError("C'est déjà votre numéro actuel.");
    }
  }

  const sendTo = purpose === "NUMBER_CHANGE" ? profile.phone! : candidatePhone;
  const code = generateCode();

  await prisma.phoneVerificationCode.create({
    data: {
      profileId,
      purpose,
      phone: sendTo,
      pendingNewPhone: purpose === "NUMBER_CHANGE" ? candidatePhone : null,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  await provider.sendVerificationCode({ phone: sendTo, code });

  await recordAudit({
    event: "phone_verification.requested",
    actorUserId: profileId,
    organizationId: null,
    metadata: { purpose },
  });
  logEvent({ event: "phone_verification.requested", profile_id: profileId, purpose, phone: maskPhone(sendTo) });

  return { purpose, sentToMasked: maskPhone(sendTo) };
}

function failVerification(profileId: string, reason: string, message: string): never {
  logEvent({ event: "phone_verification.failed", profile_id: profileId, reason });
  throw new ValidationError(message);
}

export async function confirmPhoneVerificationCode(
  profileId: string,
  enteredCode: string
): Promise<{ phone: string }> {
  const record = await prisma.phoneVerificationCode.findFirst({
    where: { profileId },
    orderBy: { createdAt: "desc" },
  });

  if (!record || record.consumedAt) {
    failVerification(profileId, "not_found", "Aucune demande de vérification en cours. Demandez un nouveau code.");
  }
  if (record.expiresAt < new Date()) {
    failVerification(profileId, "expired", "Ce code a expiré. Demandez un nouveau code.");
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    failVerification(profileId, "too_many_attempts", "Trop de tentatives. Demandez un nouveau code.");
  }

  if (!codeMatches(enteredCode, record.codeHash)) {
    await prisma.phoneVerificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    failVerification(profileId, "wrong_code", "Code incorrect.");
  }

  // Conditional: single-use, race-safe against a concurrent confirm attempt
  // (same pattern as submit-space.ts's double-submit guard).
  const consumed = await prisma.phoneVerificationCode.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) {
    failVerification(profileId, "not_found", "Aucune demande de vérification en cours. Demandez un nouveau code.");
  }

  const finalPhone = record.purpose === "NUMBER_CHANGE" ? record.pendingNewPhone! : record.phone;

  try {
    await prisma.profile.update({
      where: { id: profileId },
      data: { phone: finalPhone, phoneVerifiedAt: new Date() },
    });
  } catch (error) {
    if (isDuplicateVerifiedPhone(error)) {
      throw new ConflictError("Ce numéro est déjà utilisé et vérifié par un autre compte.");
    }
    throw error;
  }

  await recordAudit({
    event: "phone_verification.succeeded",
    actorUserId: profileId,
    organizationId: null,
    metadata: { purpose: record.purpose },
  });
  logEvent({ event: "phone_verification.succeeded", profile_id: profileId, phone: maskPhone(finalPhone) });
  await createInAppNotification({
    recipientProfileId: profileId,
    type: "PHONE_VERIFIED",
    title: "Numéro de téléphone vérifié",
    body: `Votre numéro ${maskPhone(finalPhone)} est maintenant vérifié.`,
  });

  return { phone: finalPhone };
}
