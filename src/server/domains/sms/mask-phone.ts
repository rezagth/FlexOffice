/** "+33612345678" -> "*********78". Used anywhere a phone number would
 * otherwise appear in a log, an audit entry, or an in-app notification —
 * never the full number (R69's "no phone number in a notification" extended
 * to this feature's own logging, same principle as maskEmail in
 * notifications/log-provider.ts). */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 2) return "*".repeat(digits.length);
  return `${"*".repeat(digits.length - 2)}${digits.slice(-2)}`;
}
