-- C5: a transfer taken back by Stripe must not stay "PAID" nor be retried.
ALTER TYPE "PayoutStatus" ADD VALUE IF NOT EXISTS 'REVERSED';
