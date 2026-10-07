import { logError } from "@/server/lib/logger";
import { getEmailProvider } from "./get-email-provider";
import type { EmailMessage } from "./provider";

/**
 * Every transactional send is best-effort: a failed e-mail must never fail
 * the state change it announces (a booking, a moderation decision, a
 * refund). Building the message happens inside the try too, so a template
 * bug is logged rather than thrown into the caller. Callers await this for
 * ordering only, never to gate a transition — the boolean (accepted by the
 * provider or not) is for recording, e.g. a support reply's `emailedAt`.
 */
export async function sendSafely(build: () => EmailMessage, event: string): Promise<boolean> {
  try {
    const message = build();
    await getEmailProvider().send(message);
    return true;
  } catch (error) {
    logError({ event, error });
    return false;
  }
}

/**
 * Platform operators alerted on disputes and chargebacks. ADMIN_ALERT_EMAIL
 * may hold one address or a comma-separated list; unset (or empty) means
 * no admin alert is sent — the back office still lists everything.
 */
export function adminAlertRecipients(): string[] {
  const raw = process.env.ADMIN_ALERT_EMAIL || "";
  return raw
    .split(",")
    .map((address) => address.trim())
    .filter((address) => address.length > 0 && address.includes("@"));
}
