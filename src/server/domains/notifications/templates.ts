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
