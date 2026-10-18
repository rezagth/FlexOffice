/**
 * 2B — sending an SMS is behind this interface for the same reason payments
 * are behind `PaymentProvider`: the domain logic that generates and checks a
 * code must never know which transport carried it. Only `MockSmsProvider`
 * exists today (see mock-provider.ts's own doc comment) — a real provider
 * (e.g. Twilio) is a later addition, selected by `getSmsProvider()`
 * (get-sms-provider.ts) the same way `PAYMENT_PROVIDER` selects a payment
 * provider.
 */
export interface SmsProvider {
  readonly name: string;
  sendVerificationCode(params: { phone: string; code: string }): Promise<void>;
}
