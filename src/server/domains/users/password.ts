import { createSupabaseServerClient } from "@/server/auth/supabase-server";
import { accountKey } from "@/server/auth/rate-limit";
import { recordAudit } from "@/server/lib/audit";
import { ForbiddenError, ValidationError } from "@/server/lib/errors";
import { logError, logEvent } from "@/server/lib/logger";
import { assertCurrentPassword } from "./reauth";

/** The one answer POST /api/auth/password/forgot ever gives. */
export const NEUTRAL_FORGOT_MESSAGE =
  "Si un compte existe avec cette adresse, vous allez recevoir un e-mail contenant un lien pour choisir un nouveau mot de passe.";

/**
 * How long after following a reset link the session may set a new password
 * without the current one. Matches GoTrue's default recovery link lifetime.
 */
export const RECOVERY_WINDOW_SECONDS = 60 * 60;

/**
 * AMR methods GoTrue records for a session opened from an e-mailed link.
 * "recovery" is what current GoTrue writes for a password-reset link; older
 * versions report the same verification as "otp". "magiclink" is NOT here:
 * this app never sends magic links, and accepting it would let any
 * passwordless sign-in skip the current-password check.
 */
const RECOVERY_AMR_METHODS = new Set(["recovery", "otp"]);

type AmrEntry = { method?: string; timestamp?: number } | string;

/**
 * True when the session was opened by a reset link less than
 * RECOVERY_WINDOW_SECONDS ago. String-form AMR (RFC 8176, no timestamps)
 * cannot prove recency and is refused.
 */
export function isRecentRecoverySession(amr: unknown, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!Array.isArray(amr)) return false;
  return (amr as AmrEntry[]).some(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      typeof entry.method === "string" &&
      RECOVERY_AMR_METHODS.has(entry.method) &&
      typeof entry.timestamp === "number" &&
      nowSeconds - entry.timestamp <= RECOVERY_WINDOW_SECONDS &&
      entry.timestamp <= nowSeconds + 60
  );
}

/**
 * Sends the reset e-mail. Never reports whether the address exists: every
 * outcome, including a GoTrue failure, is swallowed into the same neutral
 * answer by the caller (the failure is logged with a hashed key).
 *
 * `redirectTo` must be in the Supabase project's allow-list
 * (`GOTRUE_URI_ALLOW_LIST` / Auth → URL configuration).
 */
export async function requestPasswordReset(email: string, appBaseUrl: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appBaseUrl}/auth/confirm?next=/reset-password`,
  });
  if (error) {
    logEvent({
      event: "auth.password_reset_request_failed",
      account_scope: await accountKey(email),
      reason: error.code ?? String(error.status ?? "unknown"),
    });
    return;
  }
  logEvent({ event: "auth.password_reset_requested", account_scope: await accountKey(email) });
}

/**
 * Sets a new password for the signed-in account.
 *
 * A session alone is not enough — a stolen cookie must not be able to lock
 * the owner out. One of the two must hold:
 *   - `currentPassword` is supplied and correct (account page), or
 *   - the session was opened by a password-reset link within the last hour
 *     (the "nouveau mot de passe" page after /auth/confirm).
 *
 * Other sessions are signed out afterwards: changing a password because an
 * account may be compromised should actually evict the intruder.
 */
export async function updatePassword(params: {
  userId: string;
  email: string;
  password: string;
  currentPassword?: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();

  let via: "current_password" | "recovery_link";
  if (params.currentPassword !== undefined) {
    await assertCurrentPassword(params.email, params.currentPassword);
    via = "current_password";
  } else {
    const { data } = await supabase.auth.getClaims();
    const amr = (data?.claims as { amr?: unknown } | undefined)?.amr;
    if (!isRecentRecoverySession(amr)) {
      throw new ForbiddenError("Indiquez votre mot de passe actuel pour le modifier.");
    }
    via = "recovery_link";
  }

  const { error } = await supabase.auth.updateUser({ password: params.password });
  if (error) {
    if (error.code === "same_password") {
      throw new ValidationError("Le nouveau mot de passe doit être différent de l'ancien.");
    }
    if (error.code === "weak_password") {
      throw new ValidationError("Ce mot de passe est trop faible. Choisissez-en un plus long ou moins courant.");
    }
    if (error.code === "reauthentication_needed") {
      throw new ForbiddenError("Pour des raisons de sécurité, reconnectez-vous puis réessayez.");
    }
    logError({ event: "auth.password_update_failed", error, user_id: params.userId });
    throw new ValidationError("Le mot de passe n'a pas pu être modifié. Réessayez.");
  }

  await supabase.auth.signOut({ scope: "others" }).catch((signOutError: unknown) => {
    logError({ event: "auth.signout_others_failed", error: signOutError, user_id: params.userId });
  });

  await recordAudit({ event: "user.password_changed", actorUserId: params.userId, metadata: { via } });
}
