import type { EmailProvider } from "./provider";
import { LogEmailProvider } from "./log-provider";

let cached: EmailProvider | undefined;

/** Selected via EMAIL_PROVIDER=log — only "log" exists today. Extend this
 * factory with a real provider once one is chosen and configured, the same
 * way getPaymentProvider() branches on PAYMENT_PROVIDER. */
export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  cached = new LogEmailProvider();
  return cached;
}
