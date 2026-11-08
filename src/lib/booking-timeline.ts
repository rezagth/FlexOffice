import { formatCents } from "@/lib/format";

/**
 * The step-by-step follow-up of a booking, derived from facts already stored
 * (nothing is kept separately, so it can never disagree with the booking).
 * Pure: `now` is passed in, which also makes it testable.
 *
 * `done`  — happened. `current` — the next thing, waiting on someone.
 * `todo`  — still to come. `problem` — a cancellation, refusal or failure.
 */
export type TimelineState = "done" | "current" | "todo" | "problem";

export type TimelineEvent = {
  key: string;
  title: string;
  detail?: string;
  at: Date | null;
  state: TimelineState;
};

export type TimelineInput = {
  viewer: "client" | "landlord";
  now: Date;
  booking: {
    status: string;
    createdAt: Date;
    startsAt: Date;
    endsAt: Date;
    respondedAt: Date | null;
    cancelledAt: Date | null;
    cancelledBy: "CLIENT" | "LANDLORD" | "SYSTEM" | null;
    cancellationWindowHours: number;
  };
  payment: {
    status: string;
    capturedAt: Date | null;
    amountCents: number;
  } | null;
  refunds: Array<{ amountCents: number; status: string; createdAt: Date }>;
  /** Earning line of the landlord's payout, when one exists. */
  payoutLine: { eligibleAt: Date; paidAt: Date | null; amountCents: number } | null;
  hasReview: boolean;
};

const CANCELLER_LABEL = {
  client: { CLIENT: "par vous", LANDLORD: "par l'hôte", SYSTEM: "automatiquement" },
  landlord: { CLIENT: "par le locataire", LANDLORD: "par vous", SYSTEM: "automatiquement" },
} as const;

export function buildBookingTimeline(input: TimelineInput): TimelineEvent[] {
  const { booking, payment, refunds, payoutLine, now, viewer } = input;
  const events: TimelineEvent[] = [];
  const stayOver = booking.endsAt.getTime() <= now.getTime();
  const cancelled = booking.status === "CANCELLED";
  const rejected = booking.status === "REJECTED";
  const accepted = booking.status === "CONFIRMED" || booking.status === "COMPLETED";

  events.push({
    key: "requested",
    title: viewer === "client" ? "Demande envoyée" : "Demande reçue",
    at: booking.createdAt,
    state: "done",
  });

  const authorized = payment !== null && payment.status !== "AWAITING_AUTHORIZATION" && payment.status !== "FAILED";
  events.push({
    key: "authorized",
    title: "Paiement autorisé",
    detail: authorized ? "Le montant est réservé sur la carte ; il n'est débité qu'à l'acceptation de l'hôte." : undefined,
    at: authorized ? booking.createdAt : null,
    state: authorized ? "done" : payment?.status === "FAILED" ? "problem" : "current",
  });

  if (rejected) {
    events.push({
      key: "answer",
      title: "Demande refusée par l'hôte",
      detail: viewer === "client" ? "Rien n'a été débité." : undefined,
      at: booking.respondedAt,
      state: "problem",
    });
  } else if (accepted || (cancelled && booking.respondedAt)) {
    events.push({ key: "answer", title: "Demande acceptée", at: booking.respondedAt, state: "done" });
  } else if (!cancelled) {
    events.push({
      key: "answer",
      title: viewer === "client" ? "En attente de la réponse de l'hôte" : "À vous de répondre",
      detail: "La demande expire si elle reste sans réponse (48 h au plus, ou au début du créneau).",
      at: null,
      state: "current",
    });
  }

  if (payment?.capturedAt) {
    events.push({
      key: "captured",
      title: "Paiement encaissé",
      detail: formatCents(payment.amountCents),
      at: payment.capturedAt,
      state: "done",
    });
  } else if (accepted) {
    events.push({ key: "captured", title: "Paiement encaissé", at: null, state: "current" });
  }

  if (cancelled) {
    events.push({
      key: "cancelled",
      title: `Annulée ${booking.cancelledBy ? CANCELLER_LABEL[viewer][booking.cancelledBy] : ""}`.trim(),
      at: booking.cancelledAt,
      state: "problem",
    });
  }

  for (const [index, refund] of refunds.entries()) {
    events.push({
      key: `refund-${index}`,
      title: `Remboursement de ${formatCents(refund.amountCents)}`,
      detail: refund.status === "SUCCEEDED" ? "Effectué" : refund.status === "FAILED" ? "Échec — contactez le support" : "En cours",
      at: refund.createdAt,
      state: refund.status === "FAILED" ? "problem" : refund.status === "SUCCEEDED" ? "done" : "current",
    });
  }

  if (!cancelled && !rejected) {
    events.push({
      key: "stay",
      title: stayOver ? "Séjour terminé" : "Séjour",
      at: stayOver ? booking.endsAt : booking.startsAt,
      state: stayOver ? "done" : "todo",
    });
  }

  if (viewer === "landlord" && payoutLine) {
    events.push({
      key: "payout",
      title: payoutLine.paidAt ? "Versement effectué" : "Versement à venir",
      detail: payoutLine.paidAt
        ? formatCents(payoutLine.amountCents)
        : `${formatCents(payoutLine.amountCents)} — payable après le séjour, au prochain versement du lundi ou du 1er du mois.`,
      at: payoutLine.paidAt ?? payoutLine.eligibleAt,
      state: payoutLine.paidAt ? "done" : "todo",
    });
  }

  if (!cancelled && !rejected && stayOver) {
    events.push({
      key: "review",
      title: input.hasReview ? "Avis laissé" : viewer === "client" ? "Avis à laisser" : "Avis du locataire",
      at: null,
      state: input.hasReview ? "done" : "todo",
    });
  }

  return events;
}
