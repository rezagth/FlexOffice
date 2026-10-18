import { NextResponse } from "next/server";
import { signupWizardSchema } from "@/lib/validation/signup-wizard";
import {
  getClientIp,
  logRateLimitDenied,
  rateLimit,
  RATE_LIMITS,
} from "@/server/auth/rate-limit";
import { getAuthRuntimeMode } from "@/server/auth/runtime-config";
import { registerFromWizard } from "@/server/domains/users/register-wizard";
import { RateLimitedError, ServiceUnavailableError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";
import { getAppBaseUrl } from "@/server/lib/request-origin";

// POST /api/auth/register-wizard
// Auth: none (public signup endpoint)
// Body: SignupWizardInput (see src/lib/validation/signup-wizard.ts)
// Rate limit: same as /api/auth/register — 5 / hour / IP.
// Response: 201 { emailConfirmationRequired, companyFailedReason? } — the
//   first field is IDENTICAL whether or not the address already has an
//   account (SEC-15, see users/register.ts); companyFailedReason is only
//   set when the account itself was created but the organization could not
//   be (most likely a duplicate SIRET) — see register-wizard.ts's doc
//   comment for why the account is not rolled back.
export const POST = withErrorHandling(async (request: Request) => {
  const mode = getAuthRuntimeMode();
  if (mode !== "READY") {
    throw new ServiceUnavailableError("L'inscription n'est pas configurée.");
  }

  const { ip, trusted } = getClientIp(request);
  const verdict = await rateLimit(`auth:register:ip:${ip}`, RATE_LIMITS.authRegister);
  if (!verdict.allowed) {
    logRateLimitDenied({
      endpoint: "POST /api/auth/register-wizard",
      scope: "ip",
      retryAfterSeconds: verdict.retryAfterSeconds,
      ipTrusted: trusted,
    });
    throw new RateLimitedError(
      "Trop de tentatives d'inscription. Réessayez plus tard.",
      verdict.retryAfterSeconds
    );
  }

  const body = await request.json().catch(() => null);
  const input = signupWizardSchema.parse(body);

  const outcome = await registerFromWizard(input, { appBaseUrl: getAppBaseUrl(request) });

  return NextResponse.json(
    {
      emailConfirmationRequired: outcome.status === "CONFIRMATION_REQUIRED",
      ...(outcome.status === "ACCOUNT_CREATED_COMPANY_FAILED"
        ? { companyFailedReason: outcome.reason }
        : {}),
    },
    { status: 201 }
  );
});
