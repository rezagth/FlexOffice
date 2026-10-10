import { createClient } from "@supabase/supabase-js";
import { AppError } from "@/server/lib/errors";
import { logEvent } from "@/server/lib/logger";

/**
 * The current password was wrong on a re-authenticated action (account
 * deletion, password change). 403 rather than 401: the caller IS signed in,
 * and a 401 would read as "session expired" to the browser.
 */
export class InvalidCurrentPasswordError extends AppError {
  constructor(message = "Mot de passe actuel incorrect.") {
    super(message, "INVALID_PASSWORD", 403);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * Checks `password` against the account `email`, WITHOUT touching the
 * caller's session.
 *
 * The SSR client (supabase-server.ts) writes whatever session a sign-in
 * returns into the response cookies, so it cannot be used for a check: a
 * re-authentication would silently replace the current session. This uses a
 * throwaway client with no storage instead, and revokes the session the
 * check created (scope "local" = that session only) so it does not linger
 * as a live refresh token.
 *
 * Returns false for every failure reason; the caller turns that into one
 * uniform error.
 */
export async function verifyCurrentPassword(email: string, password: string): Promise<boolean> {
  const client = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    logEvent({ event: "auth.reauth_failed", reason: error?.code ?? "no_session" });
    return false;
  }

  // Best effort: a failure here leaves one extra session that expires on its
  // own, which is not worth failing the user's action over.
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  return true;
}

/** Throws InvalidCurrentPasswordError unless `password` is the account's. */
export async function assertCurrentPassword(email: string, password: string): Promise<void> {
  if (!(await verifyCurrentPassword(email, password))) {
    throw new InvalidCurrentPasswordError();
  }
}
