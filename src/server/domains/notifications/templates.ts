import { formatCents, formatDateTime } from "@/lib/format";

export type BookingEmailContext = {
  clientEmail: string;
  clientName: string;
  partnerEmail: string;
  partnerOrgName: string;
  spaceName: string;
  spaceAddress: string;
  spaceCity: string;
  spacePostalCode: string;
  accessInstructions?: string | null;
  startsAt: Date;
  endsAt: Date;
  priceAmountCents: number;
};

export function bookingRequestedTemplate(ctx: BookingEmailContext) {
  return {
    to: ctx.clientEmail,
    subject: `Votre demande pour ${ctx.spaceName} a été envoyée`,
    text: [
      `Bonjour ${ctx.clientName},`,
      "",
      `Votre demande de réservation pour « ${ctx.spaceName} » du ${formatDateTime(ctx.startsAt)} au ${formatDateTime(ctx.endsAt)} a bien été envoyée à ${ctx.partnerOrgName}.`,
      `Montant : ${formatCents(ctx.priceAmountCents)}. Vous ne serez débité qu'une fois la demande acceptée.`,
      "",
      "Vous recevrez un e-mail dès que l'entreprise aura répondu.",
    ].join("\n"),
  };
}

export function bookingRequestReceivedTemplate(ctx: BookingEmailContext) {
  return {
    to: ctx.partnerEmail,
    subject: `Nouvelle demande de réservation — ${ctx.spaceName}`,
    text: [
      `Bonjour,`,
      "",
      `${ctx.clientName} souhaite réserver « ${ctx.spaceName} » du ${formatDateTime(ctx.startsAt)} au ${formatDateTime(ctx.endsAt)}.`,
      `Montant : ${formatCents(ctx.priceAmountCents)} (commission incluse).`,
      "",
      "Rendez-vous dans votre espace partenaire pour accepter ou refuser cette demande.",
    ].join("\n"),
  };
}

export function bookingConfirmedTemplate(ctx: BookingEmailContext) {
  const lines = [
    `Bonjour ${ctx.clientName},`,
    "",
    `Votre réservation pour « ${ctx.spaceName} » du ${formatDateTime(ctx.startsAt)} au ${formatDateTime(ctx.endsAt)} est confirmée.`,
    "",
    `Adresse : ${ctx.spaceAddress}, ${ctx.spacePostalCode} ${ctx.spaceCity}`,
  ];
  if (ctx.accessInstructions) {
    lines.push("", `Instructions d'accès : ${ctx.accessInstructions}`);
  }
  lines.push("", `Montant débité : ${formatCents(ctx.priceAmountCents)}.`);
  return {
    to: ctx.clientEmail,
    subject: `Réservation confirmée — ${ctx.spaceName}`,
    text: lines.join("\n"),
  };
}

export function bookingRejectedTemplate(ctx: BookingEmailContext) {
  return {
    to: ctx.clientEmail,
    subject: `Votre demande pour ${ctx.spaceName} n'a pas été acceptée`,
    text: [
      `Bonjour ${ctx.clientName},`,
      "",
      `${ctx.partnerOrgName} n'a pas pu donner suite à votre demande de réservation pour « ${ctx.spaceName} » du ${formatDateTime(ctx.startsAt)} au ${formatDateTime(ctx.endsAt)}.`,
      "Aucun montant ne vous a été débité.",
      "",
      "N'hésitez pas à rechercher un autre espace disponible.",
    ].join("\n"),
  };
}

/** No landlord answer in time (or the slot started first): the hold on the
 * card is released. Used to reuse the "refused" text, which wrongly said
 * the landlord had declined. */
export function bookingExpiredTemplate(ctx: BookingEmailContext) {
  return {
    to: ctx.clientEmail,
    subject: `Votre demande pour ${ctx.spaceName} a expiré`,
    text: [
      `Bonjour ${ctx.clientName},`,
      "",
      `Votre demande de réservation pour « ${ctx.spaceName} » du ${formatDateTime(ctx.startsAt)} au ${formatDateTime(ctx.endsAt)} n'a pas reçu de réponse à temps et a expiré.`,
      "Aucun montant ne vous a été débité : l'autorisation sur votre carte est levée.",
      "",
      "N'hésitez pas à refaire une demande ou à choisir un autre espace.",
    ].join("\n"),
  };
}

export type CancellationEmailContext = BookingEmailContext & {
  /** What the client gets back, in cents (0 when nothing is refunded). */
  refundAmountCents: number;
  /** True when no payment had been captured yet (authorization released). */
  beforeCapture: boolean;
};

function refundSentence(ctx: CancellationEmailContext): string {
  if (ctx.beforeCapture) return "Aucun montant ne vous a été débité : l'autorisation sur votre carte est levée.";
  if (ctx.refundAmountCents <= 0) return "Conformément aux conditions d'annulation, aucun remboursement n'est dû.";
  return `Un remboursement de ${formatCents(ctx.refundAmountCents)} est en cours sur votre moyen de paiement (quelques jours selon votre banque).`;
}

export function bookingCancelledByClientTemplate(ctx: CancellationEmailContext) {
  return {
    to: ctx.clientEmail,
    subject: `Annulation confirmée — ${ctx.spaceName}`,
    text: [
      `Bonjour ${ctx.clientName},`,
      "",
      `Votre réservation pour « ${ctx.spaceName} » du ${formatDateTime(ctx.startsAt)} au ${formatDateTime(ctx.endsAt)} est annulée.`,
      refundSentence(ctx),
    ].join("\n"),
  };
}

export function bookingCancelledByClientNoticeTemplate(ctx: CancellationEmailContext) {
  return {
    to: ctx.partnerEmail,
    subject: `Réservation annulée par le client — ${ctx.spaceName}`,
    text: [
      "Bonjour,",
      "",
      `${ctx.clientName} a annulé sa réservation pour « ${ctx.spaceName} » du ${formatDateTime(ctx.startsAt)} au ${formatDateTime(ctx.endsAt)}.`,
      "Le créneau est de nouveau disponible à la réservation.",
    ].join("\n"),
  };
}

export function bookingCancelledByLandlordTemplate(ctx: CancellationEmailContext) {
  return {
    to: ctx.clientEmail,
    subject: `Votre réservation pour ${ctx.spaceName} est annulée`,
    text: [
      `Bonjour ${ctx.clientName},`,
      "",
      `${ctx.partnerOrgName} a dû annuler votre réservation pour « ${ctx.spaceName} » du ${formatDateTime(ctx.startsAt)} au ${formatDateTime(ctx.endsAt)}.`,
      ctx.beforeCapture
        ? "Aucun montant ne vous a été débité."
        : `Vous êtes remboursé intégralement : ${formatCents(ctx.refundAmountCents)}, sous quelques jours selon votre banque.`,
      "",
      "Toutes nos excuses pour ce contretemps. N'hésitez pas à choisir un autre espace.",
    ].join("\n"),
  };
}

export function bookingCancelledByLandlordNoticeTemplate(ctx: CancellationEmailContext) {
  return {
    to: ctx.partnerEmail,
    subject: `Annulation enregistrée — ${ctx.spaceName}`,
    text: [
      "Bonjour,",
      "",
      `Vous avez annulé la réservation de ${ctx.clientName} pour « ${ctx.spaceName} » du ${formatDateTime(ctx.startsAt)} au ${formatDateTime(ctx.endsAt)}.`,
      ctx.beforeCapture
        ? "Aucun paiement n'avait encore été encaissé."
        : `Le client est remboursé intégralement (${formatCents(ctx.refundAmountCents)}) ; le montant qui vous avait été versé est repris sur votre compte.`,
    ].join("\n"),
  };
}
