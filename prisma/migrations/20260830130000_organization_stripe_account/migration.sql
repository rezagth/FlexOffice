-- Stripe Connect account id, set once a partner organization completes
-- onboarding. Null by default: payouts stay on the mock payment provider
-- until this is populated and PAYMENT_PROVIDER=stripe.
ALTER TABLE "organizations" ADD COLUMN "stripe_account_id" TEXT;
