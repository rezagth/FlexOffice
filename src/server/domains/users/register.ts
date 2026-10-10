import type { RegisterInput } from "@/lib/validation/auth";
import { TERMS_VERSION } from "@/lib/legal-versions";
import { prisma } from "@/server/db/prisma";
import { accountKey } from "@/server/auth/rate-limit";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";
import { recordAudit } from "@/server/lib/audit";
import { ValidationError } from "@/server/lib/errors";
import { logEvent } from "@/server/lib/logger";

/**
 * What the caller is told. Deliberately carries no user id and nothing that
 * differs between "new address" and "address already registered" (SEC-15):
 * both answer CONFIRMATION_REQUIRED.
 *
 * SIGNED_IN only happens when the Supabase project auto-confirms e-mails
 * (GOTRUE_MAILER_AUTOCONFIRM=true): GoTrue then returns a session for a new
 * address and an error for a known one, and no response shaping here can
 * hide that difference. Production must keep e-mail confirmation on — it is
 * the only configuration in which signup is not an enumeration oracle.
 */
export type RegisterOutcome = { status: "CONFIRMATION_REQUIRED" } | { status: "SIGNED_IN" };

type SignUpError = { code?: string; status?: number; message?: string };

function isExistingAccountError(error: SignUpError): boolean {
  if (error.code === "user_already_exists" || error.code === "email_exists") return true;
  // Older GoTrue versions have no error code, only this message.
  return error.status === 422 && /already registered/i.test(error.message ?? "");
}

/**
 * Creates a Supabase Auth user with role/organization metadata. The
 * `handle_new_user` Postgres trigger creates the matching `profiles` row (and,
 * for a PARTNER, the owning organization) as part of the same auth.users
 * insert — it treats the metadata as hostile input (role whitelist, S-01).
 *
 * Terms acceptance (B-11) is recorded HERE, after the account exists, by the
 * server and with the server's own clock and version constant — never
 * through `options.data`, which anyone can set by calling /auth/v1/signup
 * directly. A direct signup therefore lands with `terms_accepted_at` NULL,
 * which is the truth: that person never saw the checkbox.
 *
 * `emailRedirectTo` points the confirmation link at /auth/confirm, built on
 * APP_URL (never on the request's Host header, which a client controls).
 */
export async function registerUser(
  input: RegisterInput,
  options: { appBaseUrl: string }
): Promise<RegisterOutcome> {
  const supabase = await createSupabaseServerClient();

  const metadata: Record<string, string> = {
    role: input.role,
    name: input.name,
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.role === "PARTNER"
      ? {
          organization_name: input.organizationName,
          organization_siret: input.organizationSiret,
          organization_address: input.organizationAddress,
          organization_city: input.organizationCity,
          organization_postal_code: input.organizationPostalCode,
          ...(input.organizationEmail ? { organization_email: input.organizationEmail } : {}),
        }
      : {}),
  };

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: metadata,
      emailRedirectTo: `${options.appBaseUrl}/auth/confirm?next=/post-login`,
    },
  });

  if (error) {
    if (isExistingAccountError(error)) {
      // SEC-15: same answer as a brand-new address. Logged by hashed key
      // only — an address in a log line is personal data in the wrong place.
      logEvent({ event: "auth.register_existing_address", account_scope: await accountKey(input.email) });
      return { status: "CONFIRMATION_REQUIRED" };
    }
    if (error.code === "weak_password") {
      throw new ValidationError("Ce mot de passe est trop faible. Choisissez-en un plus long ou moins courant.");
    }
    // Never pass GoTrue's own message through: English, and potentially
    // revealing. The code goes to the logs.
    logEvent({ event: "auth.register_failed", reason: error.code ?? String(error.status ?? "unknown") });
    throw new ValidationError("L'inscription a échoué. Vérifiez vos informations et réessayez.");
  }

  const user = data.user;
  // With e-mail confirmation on, GoTrue answers a known address with an
  // obfuscated user that has no identities and was never inserted.
  if (!user || (Array.isArray(user.identities) && user.identities.length === 0)) {
    logEvent({ event: "auth.register_existing_address", account_scope: await accountKey(input.email) });
    return { status: "CONFIRMATION_REQUIRED" };
  }

  // Only the first acceptance counts: `termsAcceptedAt: null` in the where
  // makes a replayed request unable to move the date.
  const accepted = await prisma.profile.updateMany({
    where: { id: user.id, termsAcceptedAt: null },
    data: { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION },
  });
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });

  await recordAudit({
    event: "user.registered",
    actorUserId: user.id,
    organizationId: profile?.organizationId ?? null,
    metadata: { role: input.role, termsVersion: TERMS_VERSION, termsRecorded: accepted.count === 1 },
  });
  if (input.role === "PARTNER" && profile?.organizationId) {
    await recordAudit({
      event: "organization.created",
      actorUserId: user.id,
      organizationId: profile.organizationId,
      metadata: { name: input.organizationName },
    });
  }

  return data.session ? { status: "SIGNED_IN" } : { status: "CONFIRMATION_REQUIRED" };
}
