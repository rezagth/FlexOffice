import { isProductionDeployment } from "@/server/auth/runtime-config";
import { logError } from "@/server/lib/logger";
import type { EmailProvider } from "./provider";
import { LogEmailProvider } from "./log-provider";
import { ResendEmailProvider } from "./resend-provider";

let cached: EmailProvider | undefined;

/** Selected via EMAIL_PROVIDER=log|resend — defaults to log so a deployment
 * with no RESEND_API_KEY configured keeps working exactly as before, the
 * same zero-config contract getPaymentProvider() follows for PAYMENT_PROVIDER. */
export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const kind = process.env.EMAIL_PROVIDER || "log";
  // Kept non-blocking on purpose: refusing to send would fail the booking
  // that triggered the e-mail. But in a real production deployment a
  // logged-only e-mail means a client never receives their confirmation
  // or access instructions, so it is reported at error level.
  if (kind !== "resend" && isProductionDeployment()) {
    logError({
      event: "email.provider_not_configured_in_production",
      error: new Error(`EMAIL_PROVIDER="${kind}": transactional e-mails are logged, not sent.`),
    });
  }
  cached = kind === "resend" ? new ResendEmailProvider() : new LogEmailProvider();
  return cached;
}
