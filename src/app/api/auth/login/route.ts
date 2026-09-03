import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation/auth";
import {
  accountKey,
  getClientIp,
  logRateLimitDenied,
  rateLimit,
  RATE_LIMITS,
} from "@/server/auth/rate-limit";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";
import { getAuthRuntimeMode } from "@/server/auth/runtime-config";
import { RateLimitedError, ServiceUnavailableError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";
import { logEvent } from "@/server/lib/logger";

// POST /api/auth/login
// Auth: none (this is how a session is obtained)
// Body: { email, password }
// Rate limit: 10 / 5 min / IP  +  5 / 15 min / account
//
// WHY THIS ROUTE EXISTS
// Sign-in used to happen entirely in the browser: login-form.tsx called
// `supabase.auth.signInWithPassword()` directly. That left no server on the
// path, so `RATE_LIMITS.authLogin` was configured and never consumed (S-04),
// no failed attempt was ever logged, and nothing could observe credential
// stuffing. Routing sign-in through the server makes all three possible.
//
// WHAT THIS ROUTE DOES *NOT* DO — READ BEFORE RELYING ON IT
// Supabase's own token endpoint stays reachable from any browser with the
// publishable anon key, which is in the JS bundle by design:
//
//   POST https://<project>.supabase.co/auth/v1/token?grant_type=password
//
// An attacker will use that, not this route. The limits below therefore
// protect the normal path and give us telemetry; they are NOT the ceiling on
// attempts against the project. The ceiling has to be set where the requests
// actually land — Supabase Auth rate limits, in the project dashboard. This is
// recorded in the Phase 1 report under PROBLÈMES RESTANTS rather than left
// implied, because a control that only covers the polite path is worth
// exactly what it covers.
export const POST = withErrorHandling(async (request: Request) => {
  const mode = getAuthRuntimeMode();
  if (mode !== "READY") {
    // Demo deployment or missing configuration: there is no auth backend to
    // talk to. Answer honestly instead of surfacing a client constructor
    // crash as a 500.
    throw new ServiceUnavailableError("L'authentification n'est pas configurée.");
  }

  const { ip, trusted } = getClientIp(request);

  const byIp = await rateLimit(`auth:login:ip:${ip}`, RATE_LIMITS.authLogin);
  if (!byIp.allowed) {
    logRateLimitDenied({
      endpoint: "POST /api/auth/login",
      scope: "ip",
      retryAfterSeconds: byIp.retryAfterSeconds,
      ipTrusted: trusted,
    });
    throw new RateLimitedError(
      "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
      byIp.retryAfterSeconds
    );
  }

  const body = await request.json().catch(() => null);
  const input = loginSchema.parse(body);

  // Per-account limit, keyed on a salted hash so no address reaches the
  // rate-limit store. Tighter than the per-IP limit because credential
  // stuffing spreads across addresses but concentrates on accounts.
  const accountScope = await accountKey(input.email);
  const byAccount = await rateLimit(
    `auth:login:account:${accountScope}`,
    RATE_LIMITS.authLoginPerAccount
  );
  if (!byAccount.allowed) {
    logRateLimitDenied({
      endpoint: "POST /api/auth/login",
      scope: "account",
      retryAfterSeconds: byAccount.retryAfterSeconds,
      ipTrusted: trusted,
    });
    // Same wording and same status as the per-IP case: telling the caller
    // *which* limit they hit would confirm that the account exists.
    throw new RateLimitedError(
      "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
      byAccount.retryAfterSeconds
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data.user) {
    // One response for every failure reason — unknown address, wrong
    // password, unconfirmed email. Supabase's own message distinguishes them
    // and must not be passed through: that difference is an account
    // enumeration oracle.
    //
    // The log records the outcome, never the password and never the address:
    // an email in a log line is personal data sitting in a system with a
    // different retention policy and a wider audience than the database.
    logEvent({
      event: "auth.login_failed",
      account_scope: accountScope,
      ip_trusted: trusted,
      reason: error?.code ?? "unknown",
    });
    return NextResponse.json(
      {
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Email ou mot de passe incorrect.",
        },
      },
      { status: 401 }
    );
  }

  logEvent({ event: "auth.login_succeeded", user_id: data.user.id });

  // The session cookies were written by the SSR client's `setAll` during
  // signInWithPassword. No token is returned in the body: the browser reads
  // the session from those cookies via createBrowserClient, and a token in a
  // JSON payload is a token that ends up in a log or a cache.
  return NextResponse.json({ userId: data.user.id });
});
