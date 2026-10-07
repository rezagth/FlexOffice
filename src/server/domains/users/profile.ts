import type { UpdateProfileInput } from "@/lib/validation/auth";
import { prisma } from "@/server/db/prisma";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";
import { recordAudit } from "@/server/lib/audit";
import { NotFoundError, ValidationError } from "@/server/lib/errors";
import { logError, logEvent } from "@/server/lib/logger";

/**
 * Edits the caller's own name and phone (FCT-18). Scoped by the session's
 * user id in the `where`; an anonymized profile is never editable (the
 * GDPR tombstone must stay a tombstone).
 */
export async function updateOwnProfile(userId: string, input: UpdateProfileInput) {
  const result = await prisma.profile.updateMany({
    where: { id: userId, deletedAt: null },
    data: { name: input.name, phone: input.phone },
  });
  if (result.count === 0) throw new NotFoundError("Profil introuvable.");

  // Which fields, never their values: an audit trail is not a second copy
  // of the personal data.
  await recordAudit({
    event: "user.profile_updated",
    actorUserId: userId,
    metadata: { fields: ["name", "phone"] },
  });

  return prisma.profile.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, phone: true, email: true },
  });
}

/** The one answer to an e-mail change request, whatever happened. */
export const EMAIL_CHANGE_MESSAGE =
  "Un lien de confirmation a été envoyé à la nouvelle adresse. Votre adresse actuelle reste active tant que vous n'avez pas cliqué dessus.";

/**
 * Starts an e-mail change. Supabase sends the confirmation link(s); the
 * address only changes once it is clicked (auth.users.email), and the
 * `on_auth_user_email_updated` trigger then copies it to profiles.email.
 *
 * "Address already used by another account" is answered exactly like a
 * success: otherwise this form, behind any free account, would be an
 * enumeration oracle (SEC-15).
 */
export async function requestEmailChange(params: {
  userId: string;
  currentEmail: string;
  newEmail: string;
  appBaseUrl: string;
}): Promise<{ message: string }> {
  if (params.newEmail.trim().toLowerCase() === params.currentEmail.trim().toLowerCase()) {
    throw new ValidationError("C'est déjà votre adresse actuelle.");
  }

  const supabase = await createSupabaseServerClient();
  const next = encodeURIComponent("/app/account?email=confirmed");
  const { error } = await supabase.auth.updateUser(
    { email: params.newEmail },
    { emailRedirectTo: `${params.appBaseUrl}/auth/confirm?next=${next}` }
  );

  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      logEvent({ event: "user.email_change_address_taken", user_id: params.userId });
      return { message: EMAIL_CHANGE_MESSAGE };
    }
    logError({ event: "user.email_change_failed", error, user_id: params.userId });
    throw new ValidationError("Le changement d'adresse n'a pas pu être demandé. Réessayez plus tard.");
  }

  await recordAudit({ event: "user.email_change_requested", actorUserId: params.userId });
  return { message: EMAIL_CHANGE_MESSAGE };
}

/** The editable part of the caller's own profile, for the account page. */
export async function getOwnProfile(userId: string) {
  return prisma.profile.findFirst({
    where: { id: userId, deletedAt: null },
    select: { name: true, email: true, phone: true, termsAcceptedAt: true, termsVersion: true },
  });
}
