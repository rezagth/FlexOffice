/**
 * Abstraction over transactional email so the rest of the app never talks
 * to a specific mail API directly. Swappable via EMAIL_PROVIDER — "log"
 * today (no real send, no provider account yet), a real provider (Resend,
 * SendGrid…) once one is chosen and a key is available. See
 * getEmailProvider().
 */
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id: string }>;
}
