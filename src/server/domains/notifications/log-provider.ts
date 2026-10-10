import { logEvent } from "@/server/lib/logger";
import type { EmailProvider, EmailMessage } from "./provider";

/**
 * Default provider until a real one (Resend, SendGrid…) is chosen and
 * configured with a key. Never sends network traffic — logs that an email
 * *would* have gone out, and only the envelope (recipient, subject,
 * provider), never the body: the log stream is not the place for booking
 * addresses or client names at volume. The recipient is masked too — an
 * e-mail address is personal data, and the domain is enough to debug.
 */
export class LogEmailProvider implements EmailProvider {
  readonly name = "log";

  async send(message: EmailMessage): Promise<{ id: string }> {
    const id = `log_${crypto.randomUUID()}`;
    logEvent({
      event: "email.logged",
      provider: this.name,
      to: maskEmail(message.to),
      subject: message.subject,
      email_id: id,
    });
    return { id };
  }
}

/** "jane.doe@acme.fr" -> "j***@acme.fr". */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${address[0]}***${address.slice(at)}`;
}
