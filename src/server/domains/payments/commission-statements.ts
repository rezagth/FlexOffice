import Stripe from "stripe";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { ValidationError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";

function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new ValidationError("Le paiement réel n'est pas configuré sur cette instance.");
  }
  return new Stripe(secretKey, { apiVersion: "2026-08-26.dahlia" });
}

/** Creates the Stripe Customer on first call; returns the existing one on
 * every later call. This is the org as a bill-to party for commission
 * statements — distinct from Organization.stripeAccountId, its Connect
 * payee id (see stripe-connect.ts's getOrCreateAccountId, same shape). */
async function getOrCreateCustomerId(organizationId: string): Promise<string> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { id: true, stripeCustomerId: true, name: true, email: true },
  });
  if (organization.stripeCustomerId) return organization.stripeCustomerId;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    name: organization.name,
    email: organization.email,
    metadata: { organizationId: organization.id },
  });

  await prisma.organization.update({
    where: { id: organizationId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

/**
 * Generates (or returns the existing) monthly commission statement for one
 * organization: a real Stripe Invoice, one line per booking, finalized and
 * marked `paid_out_of_band` — the commission was already collected at
 * charge-capture time via the destination-charge split, so this is a
 * retrospective record, never a new collection attempt.
 *
 * Idempotent: `@@unique([organizationId, periodStart])` on
 * CommissionStatement means re-running the same month returns the existing
 * row instead of creating a second invoice — same P2002-as-idempotency
 * idiom as the webhook ledger.
 */
export async function generateMonthlyCommissionStatement(
  organizationId: string,
  periodStart: Date,
  periodEnd: Date
) {
  const existing = await prisma.commissionStatement.findUnique({
    where: { organizationId_periodStart: { organizationId, periodStart } },
  });
  if (existing) return existing;

  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      status: "SUCCEEDED",
      capturedAt: { gte: periodStart, lt: periodEnd },
    },
    include: { booking: { include: { space: true } } },
  });
  if (payments.length === 0) return null;

  const customerId = await getOrCreateCustomerId(organizationId);
  const stripe = getStripeClient();

  for (const payment of payments) {
    await stripe.invoiceItems.create({
      customer: customerId,
      currency: "eur",
      amount: payment.commissionAmountCents,
      description: `Commission — ${payment.booking.space.name} — ${payment.capturedAt!.toLocaleDateString("fr-FR")}`,
    });
  }

  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: "send_invoice",
    days_until_due: 0,
    auto_advance: false,
    // Without this, invoices.create() does NOT pull in the invoice items
    // just created above — confirmed against the real test API, where the
    // invoice was otherwise finalized with total: 0.
    pending_invoice_items_behavior: "include",
  });
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id!);
  // With days_until_due: 0, Stripe can mark a finalized invoice paid on its
  // own (observed in test mode) — calling pay() again on an
  // already-paid invoice is a real Stripe error ("Invoice is already
  // paid"), not something to swallow blindly, so only call it when needed.
  const paid =
    finalized.status === "paid"
      ? finalized
      : await stripe.invoices.pay(finalized.id!, { paid_out_of_band: true });

  const totalCommissionAmountCents = payments.reduce(
    (sum, payment) => sum + payment.commissionAmountCents,
    0
  );

  try {
    const statement = await prisma.commissionStatement.create({
      data: {
        organizationId,
        periodStart,
        periodEnd,
        stripeInvoiceId: paid.id!,
        totalCommissionAmountCents,
        hostedInvoiceUrl: paid.hosted_invoice_url ?? "",
        invoicePdfUrl: paid.invoice_pdf ?? "",
      },
    });

    await recordAudit({
      event: "commission_statement.generated",
      organizationId,
      metadata: { statementId: statement.id, stripeInvoiceId: paid.id, totalCommissionAmountCents },
    });

    return statement;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Another request generated this org/month between our check above
      // and this insert. The Stripe invoice we just created is a harmless
      // duplicate on Stripe's side (this org's commission is still stated
      // correctly by whichever row won) — return the row that won.
      return await prisma.commissionStatement.findUniqueOrThrow({
        where: { organizationId_periodStart: { organizationId, periodStart } },
      });
    }
    throw error;
  }
}
