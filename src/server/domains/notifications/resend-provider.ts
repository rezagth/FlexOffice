import { Resend } from "resend";
import type { EmailMessage, EmailProvider } from "./provider";

/**
 * Real transactional email via Resend. Selected by EMAIL_PROVIDER=resend
 * (see get-email-provider.ts) — the app still defaults to LogEmailProvider
 * so a deployment with no key configured keeps working exactly as before,
 * same zero-config-degrades-gracefully contract as the payment provider.
 *
 * Text-only, matching the templates in templates.ts — no HTML body is
 * generated today, so none is sent rather than a bare, unstyled one.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private readonly client: Resend;
  private readonly from: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY must be set");
    }
    // Resend's own shared test sender — works with zero domain setup, but
    // Resend restricts it to the account's own verified email addresses.
    // Set EMAIL_FROM once a real sending domain is verified.
    this.from = process.env.EMAIL_FROM || "OfficeFlex <onboarding@resend.dev>";
    this.client = new Resend(apiKey);
  }

  async send(message: EmailMessage): Promise<{ id: string }> {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.name} — ${error.message}`);
    }
    // Only reached if the SDK neither threw nor returned an error, but its
    // own types allow `data` to be null on success — defend against that
    // rather than asserting past it.
    if (!data) {
      throw new Error("Resend send returned no data and no error");
    }
    return { id: data.id };
  }
}
