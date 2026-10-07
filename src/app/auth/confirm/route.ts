import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeRedirectPath } from "@/lib/validation/redirect";
import { getAuthRuntimeMode } from "@/server/auth/runtime-config";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";
import { logEvent } from "@/server/lib/logger";
import { getAppBaseUrl } from "@/server/lib/request-origin";

// GET /auth/confirm — landing point of every link Supabase Auth e-mails
// (B-15): signup confirmation, password reset, e-mail change, invitation.
//
// Two link shapes are accepted, per the @supabase/ssr guide:
//   ?token_hash=…&type=…  → verifyOtp. Works in any browser; requires the
//                           e-mail templates to point here (see the lot A
//                           report for the template lines).
//   ?code=…               → exchangeCodeForSession (PKCE). Only works in the
//                           browser that started the flow, which holds the
//                           code verifier cookie.
// Either way the session cookies are written by the SSR client and merged
// into the redirect below by Next.
//
// `next` is attacker-controllable (anyone can craft a link to this route), so
// it goes through safeRedirectPath: same-origin paths only. The redirect is
// built on APP_URL, never on the Host header.

const SUPPORTED_TYPES = new Set<EmailOtpType>(["signup", "recovery", "email_change", "invite", "email"]);

function defaultNextFor(type: string | null): string {
  switch (type) {
    case "recovery":
      return "/reset-password";
    case "email_change":
      return "/app/account?email=confirmed";
    default:
      return "/post-login";
  }
}

function failurePathFor(type: string | null, next: string): string {
  // A dead reset link sends the user straight back to asking for a new one.
  if (type === "recovery" || next.startsWith("/reset-password")) {
    return "/forgot-password?error=link_invalid";
  }
  return "/login?error=link_invalid";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = getAppBaseUrl(request);
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const code = url.searchParams.get("code");
  const next = safeRedirectPath(url.searchParams.get("next"), defaultNextFor(rawType));

  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, base), { status: 303 });

  if (getAuthRuntimeMode() !== "READY") {
    return redirectTo("/login?error=auth_unavailable");
  }

  const supabase = await createSupabaseServerClient();

  let failure: string | null = null;
  if (tokenHash && rawType) {
    if (!SUPPORTED_TYPES.has(rawType as EmailOtpType)) {
      failure = "unsupported_type";
    } else {
      const { error } = await supabase.auth.verifyOtp({
        type: rawType as EmailOtpType,
        token_hash: tokenHash,
      });
      if (error) failure = error.code ?? "verify_failed";
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) failure = error.code ?? "exchange_failed";
  } else {
    failure = "missing_token";
  }

  if (failure) {
    // No token, no address: only the reason and the link type.
    logEvent({ event: "auth.confirm_failed", reason: failure, link_type: rawType ?? "code" });
    return redirectTo(failurePathFor(rawType, next));
  }

  logEvent({ event: "auth.confirm_succeeded", link_type: rawType ?? "code" });
  return redirectTo(next);
}
