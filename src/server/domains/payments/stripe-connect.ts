import Stripe from "stripe";
import { prisma } from "@/server/db/prisma";
import { ValidationError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { logError, logEvent } from "@/server/lib/logger";

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
  return new Stripe(secretKey, { apiVersion: "2026-08-26.dahlia" });
}

/** Upper bound for the Stripe call made while the organization row is
 * locked — beyond it the transaction is abandoned rather than holding the
 * lock for as long as the network decides. */
const ACCOUNT_CREATION_TIMEOUT_MS = 20_000;

/**
 * Creates the Express account on first call; returns the existing one on
 * every later call. Never creates a second account for one organization —
 * two guarantees, because a double click or two tabs on the onboarding
 * button used to race straight into two `accounts.create` calls:
 *
 *   1. a row lock (`SELECT … FOR UPDATE` on the organization) serializes
 *      concurrent callers in this app: the second one waits, then reads the
 *      id the first one stored;
 *   2. a Stripe idempotency key derived from the organization id makes Stripe
 *      itself return the same account if a retry still reaches it (process
 *      killed after the Stripe call, before the commit).
 */
async function getOrCreateAccountId(organizationId: string): Promise<string> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { id: true, stripeAccountId: true },
  });
  if (organization.stripeAccountId) return organization.stripeAccountId;

  return prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<Array<{ stripe_account_id: string | null; email: string }>>`
        SELECT stripe_account_id, email FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
      const row = locked[0];
      if (!row) throw new ValidationError("Organisation introuvable.");
      if (row.stripe_account_id) return row.stripe_account_id;

      const stripe = getStripeClient();
      const account = await stripe.accounts.create(
        {
          type: "express",
          email: row.email,
          // Every organization in this codebase is French today (Property has
          // its own `country`, defaulted "FR", for exactly this reason — see its
          // schema comment) — Organization itself has no country column yet.
          country: "FR",
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          metadata: { organization_id: organizationId },
        },
        { idempotencyKey: `connect-account-create-${organizationId}` }
      );

      await tx.organization.update({
        where: { id: organizationId },
        data: { stripeAccountId: account.id },
      });
      await tx.auditLog.create({
        data: {
          event: "stripe_connect.account_created",
          organizationId,
          metadata: { stripeAccountId: account.id },
        },
      });
      return account.id;
    },
    { timeout: ACCOUNT_CREATION_TIMEOUT_MS, maxWait: ACCOUNT_CREATION_TIMEOUT_MS }
  );
}

/**
 * Re-reads the landlord's Connect account from Stripe and stores the two
 * readiness flags that decide whether their spaces are listed (C1). The
 * source of truth is always the live read, never an event payload: an
 * `account.updated` delivered late or out of order cannot flip the flags
 * back to a stale state.
 */
export async function refreshConnectReadiness(organizationId: string): Promise<ConnectStatus> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { stripeAccountId: true },
  });
  if (!organization.stripeAccountId) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { stripeChargesEnabled: false, stripePayoutsEnabled: false, stripeStatusSyncedAt: new Date() },
    });
    return { connected: false };
  }

  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(organization.stripeAccountId);
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      stripeChargesEnabled: account.charges_enabled,
      stripePayoutsEnabled: account.payouts_enabled,
      stripeStatusSyncedAt: new Date(),
    },
  });
  return {
    connected: true,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}

/** Landlords re-checked per maintenance run (Stripe rate limits, run time). */
const CONNECT_SWEEP_BATCH = 10;
/** Do not re-read the same not-ready account more often than this. */
const CONNECT_SWEEP_MIN_AGE_MS = 10 * 60_000;

/**
 * Maintenance step (C1 safety net): a landlord who finished onboarding but
 * whose `account.updated` webhook never reached us (endpoint not created yet,
 * delivery failure) would stay hidden forever. Re-reads, a few per run, the
 * accounts that exist but are not yet marked ready. No-op outside real Stripe.
 */
export async function refreshPendingConnectAccounts(now: Date = new Date()) {
  if (process.env.PAYMENT_PROVIDER !== "stripe" || !process.env.STRIPE_SECRET_KEY) {
    return { checked: 0, becameReady: 0, failed: 0 };
  }
  const organizations = await prisma.organization.findMany({
    where: {
      stripeAccountId: { not: null },
      OR: [{ stripeChargesEnabled: false }, { stripePayoutsEnabled: false }],
      AND: [
        {
          OR: [
            { stripeStatusSyncedAt: null },
            { stripeStatusSyncedAt: { lt: new Date(now.getTime() - CONNECT_SWEEP_MIN_AGE_MS) } },
          ],
        },
      ],
    },
    select: { id: true },
    orderBy: { stripeStatusSyncedAt: { sort: "asc", nulls: "first" } },
    take: CONNECT_SWEEP_BATCH,
  });

  let becameReady = 0;
  let failed = 0;
  for (const { id } of organizations) {
    try {
      const status = await refreshConnectReadiness(id);
      if (status.connected && status.chargesEnabled && status.payoutsEnabled) becameReady += 1;
    } catch (error) {
      failed += 1;
      logError({ event: "stripe_connect.sweep_failed", error, organization_id: id });
    }
  }
  if (becameReady > 0 || failed > 0) {
    logEvent({ event: "stripe_connect.sweep_run", checked: organizations.length, became_ready: becameReady, failed });
  }
  return { checked: organizations.length, becameReady, failed };
}

/** Fields of a Stripe `account.updated` event this app looks at. */
export type ConnectAccountEventData = {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: { disabled_reason?: string | null; currently_due?: string[] | null } | null;
};

export function isConnectAccountEventData(data: unknown): data is ConnectAccountEventData {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as { id?: unknown }).id === "string" &&
    (data as { id: string }).id.startsWith("acct_")
  );
}

/**
 * `account.updated` (a Connect webhook): journals the account's state in the
 * audit log, so "why can't this landlord be booked?" has an answer in the
 * back office, then refreshes the cached readiness flags (C1) from a LIVE
 * read of the account. The payload is never trusted for the flags, and
 * eligibility at booking time is still read live from Stripe (see
 * stripe-provider.ts), so an out-of-order event cannot grant anything. An
 * account this app did not create is logged and ignored.
 */
export async function recordConnectAccountUpdate(data: ConnectAccountEventData): Promise<void> {
  const organization = await prisma.organization.findFirst({
    where: { stripeAccountId: data.id },
    select: { id: true },
  });
  if (!organization) {
    logEvent({ event: "stripe_connect.unknown_account", stripe_account_id: data.id });
    return;
  }
  await recordAudit({
    event: "stripe_connect.account_updated",
    organizationId: organization.id,
    metadata: {
      stripeAccountId: data.id,
      chargesEnabled: data.charges_enabled ?? null,
      payoutsEnabled: data.payouts_enabled ?? null,
      detailsSubmitted: data.details_submitted ?? null,
      disabledReason: data.requirements?.disabled_reason ?? null,
      currentlyDueCount: data.requirements?.currently_due?.length ?? 0,
    },
  });
  await refreshConnectReadiness(organization.id);
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
  // Same live read, and it keeps the cached listing flags (C1) in step: the
  // landlord coming back from onboarding sees their spaces appear at once.
  return refreshConnectReadiness(organizationId);
}
