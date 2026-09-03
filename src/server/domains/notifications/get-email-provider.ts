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
  cached = kind === "resend" ? new ResendEmailProvider() : new LogEmailProvider();
  return cached;
}
