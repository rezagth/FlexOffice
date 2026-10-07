import type { RateLimitConfig } from "@/server/auth/rate-limit";

/**
 * Rate limits for the account flows added in lot A. Kept next to the domain
 * rather than in RATE_LIMITS so this lot does not collide with others
 * editing that shared table; same shape, same store, same semantics.
 */
export const ACCOUNT_RATE_LIMITS = {
  /** Reset e-mails requested from one IP, across all addresses. */
  passwordForgotPerIp: { limit: 5, windowSeconds: 900 } satisfies RateLimitConfig,
  /** Reset e-mails for one address, whatever the source — stops mail-bombing. */
  passwordForgotPerAccount: { limit: 3, windowSeconds: 3600 } satisfies RateLimitConfig,
  /** Password changes (reset or account page), per account. Each one with a
   * current password is also a guess at it. */
  passwordUpdate: { limit: 5, windowSeconds: 900 } satisfies RateLimitConfig,
  /** Profile edits, per account. */
  profileUpdate: { limit: 30, windowSeconds: 3600 } satisfies RateLimitConfig,
  /** E-mail change requests, per account — each one sends two e-mails. */
  emailChange: { limit: 5, windowSeconds: 3600 } satisfies RateLimitConfig,
} as const;
