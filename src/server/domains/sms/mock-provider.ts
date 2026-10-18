import { isProductionDeployment } from "@/server/auth/runtime-config";
import { logEvent } from "@/server/lib/logger";
import type { SmsProvider } from "./provider";
import { maskPhone } from "./mask-phone";

/**
 * The only `SmsProvider` that exists in this lot — no real provider (Twilio
 * or similar) is wired up yet. Refuses to even be constructed in a real
 * production deployment (`isProductionDeployment()`): unlike
 * `LogEmailProvider`, which is a legitimate default until a real mailer is
 * configured, silently "sending" an SMS that never reaches a phone would let
 * production believe phone verification works when it cannot. A production
 * deployment without a real provider must set `PHONE_VERIFICATION_REQUIRED=false`
 * itself (see runtime-config.ts's doc comment) — this class will never do
 * that relaxation for it.
 *
 * Never logs the code itself, even here: the structured log stream is not
 * the place for a value that authenticates an action, and this provider is
 * exercised by automated tests (which read the code from where
 * phone-verification.ts puts it before hashing it), not by a human reading
 * a terminal.
 */
export class MockSmsProvider implements SmsProvider {
  readonly name = "mock";

  constructor() {
    if (isProductionDeployment()) {
      throw new Error(
        "MockSmsProvider must never run in a real production deployment — no real SMS " +
          "provider is wired up yet. Set PHONE_VERIFICATION_REQUIRED=false until one is."
      );
    }
  }

  async sendVerificationCode({ phone }: { phone: string; code: string }): Promise<void> {
    logEvent({ event: "sms.mock_sent", provider: this.name, phone: maskPhone(phone) });
  }
}
