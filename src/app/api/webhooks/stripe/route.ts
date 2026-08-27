import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { getPaymentProvider } from "@/server/domains/payments/get-payment-provider";
import { logEvent } from "@/server/lib/logger";
import { withErrorHandling } from "@/server/lib/http";

// POST /api/webhooks/stripe
// Auth: none — authenticity comes from the provider signature, not a
// session. Never trust this payload before verifyWebhookEvent() passes.
//
// Scaffolded for this iteration: signature verification + idempotent
// event storage work end-to-end (swap PAYMENT_PROVIDER=stripe once real
// keys exist). Applying the event to Booking/Payment status is the
// payments iteration's job — this only records that the event happened,
// exactly once, so nothing is silently lost while that logic is missing.
export const POST = withErrorHandling(async (request: Request) => {
  const provider = getPaymentProvider();
  const rawBody = await request.text();
  const signature = request.headers.get(provider.signatureHeaderName);

  const event = provider.verifyWebhookEvent(rawBody, signature);

  try {
    await prisma.webhookEvent.create({
      data: {
        provider: provider.name,
        providerEventId: event.id,
        type: event.type,
        payload: event.data as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Provider retried a delivery we already processed — safe no-op.
      logEvent({ event: "webhook.duplicate_ignored", providerEventId: event.id });
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw error;
  }

  logEvent({ event: "webhook.received", providerEventId: event.id, type: event.type });

  return NextResponse.json({ received: true });
});
