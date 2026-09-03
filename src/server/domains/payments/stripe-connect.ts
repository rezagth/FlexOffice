import Stripe from "stripe";
import { prisma } from "@/server/db/prisma";
import { ValidationError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";

/**
 * Stripe Connect onboarding for a landlord organization — separate from
 * `stripe-provider.ts` (which only ever *uses* `Organization.stripeAccountId`
 * once it exists). This is the one place that id is ever written.
 *
 * Express accounts: Stripe hosts the onboarding form itself (identity,
 * bank details), so this app never touches or stores banking details —
 * consistent with "aucune donnée bancaire stockée en propre" everywhere
 * else in this codebase.
 */
function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new ValidationError("Le paiement réel n'est pas configuré sur cette instance.");
  }
  return new Stripe(secretKey);
}

/** Creates the Express account on first call; returns the existing one on
 * every later call. Never creates a second account for one organization. */
async function getOrCreateAccountId(organizationId: string): Promise<string> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { id: true, stripeAccountId: true, email: true },
  });
  if (organization.stripeAccountId) return organization.stripeAccountId;

  const stripe = getStripeClient();
  const account = await stripe.accounts.create({
    type: "express",
    email: organization.email,
    // Every organization in this codebase is French today (Property has
    // its own `country`, defaulted "FR", for exactly this reason — see its
    // schema comment) — Organization itself has no country column yet.
    country: "FR",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  await prisma.organization.update({
    where: { id: organizationId },
    data: { stripeAccountId: account.id },
  });
  await recordAudit({
    event: "stripe_connect.account_created",
    organizationId,
    metadata: { stripeAccountId: account.id },
  });

  return account.id;
}

/**
 * Starts (or resumes) hosted onboarding. `refreshUrl` is where Stripe sends
 * the landlord back if the link expired before they finished; `returnUrl`
 * is where they land after completing the form — completion does not by
 * itself mean `charges_enabled`/`payouts_enabled`, the caller re-checks
 * status (see `getAccountStatus`) rather than assuming success from the
 * redirect alone.
 */
export async function createOnboardingLink(
  organizationId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const accountId = await getOrCreateAccountId(organizationId);
  const stripe = getStripeClient();
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });
  return link.url;
}

export type ConnectStatus =
  | { connected: false }
  | { connected: true; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean };

/** Reads the account's current state directly from Stripe — never cached
 * beyond the request, so this always reflects what Stripe actually thinks,
 * not a status this app updated itself and might have gotten stale. */
export async function getAccountStatus(organizationId: string): Promise<ConnectStatus> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { stripeAccountId: true },
  });
  if (!organization.stripeAccountId) return { connected: false };

  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(organization.stripeAccountId);
  return {
    connected: true,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}
