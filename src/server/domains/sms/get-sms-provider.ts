import { MockSmsProvider } from "./mock-provider";
import type { SmsProvider } from "./provider";

/**
 * Only one provider exists today (see mock-provider.ts) — there is no
 * `SMS_PROVIDER=mock|<real>` selection yet, unlike `getPaymentProvider()`.
 * Add that branch here, not at call sites, the day a real provider exists.
 *
 * `MockSmsProvider`'s own constructor refuses in a real production
 * deployment, so this throws there too — callers (phone-verification.ts)
 * turn that into a clear 503, the same way a misconfigured payment provider
 * does, rather than letting a raw constructor error reach an API response.
 */
let cached: SmsProvider | undefined;

export function getSmsProvider(): SmsProvider {
  if (!cached) cached = new MockSmsProvider();
  return cached;
}

/** Test-only: forget the cached provider. */
export function resetSmsProviderForTests() {
  cached = undefined;
}
