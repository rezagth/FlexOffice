import { formatCents, formatDateTime } from "@/lib/format";
import { renderEmail, type EmailDetailRow, type RenderedEmail } from "./layout";

/**
 * Every transactional e-mail OfficeFlex sends. Each template returns the
 * envelope plus a text AND an HTML body, both produced by layout.ts from
 * the same structured content — templates never build markup, so every
 * value interpolated here (names, space names, reasons) is escaped there.
 */

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

const CLIENT_BOOKINGS_PATH = "/app/bookings";
const LANDLORD_REQUESTS_PATH = "/app/landlord/requests";

function slot(ctx: { startsAt: Date; endsAt: Date }): string {
  return `du ${formatDateTime(ctx.startsAt)} au ${formatDateTime(ctx.endsAt)}`;
}

function bookingDetails(ctx: BookingEmailContext, extra: EmailDetailRow[] = []): EmailDetailRow[] {
  return [
    { label: "Espace", value: ctx.spaceName },
    { label: "Début", value: formatDateTime(ctx.startsAt) },
    { label: "Fin", value: formatDateTime(ctx.endsAt) },
    ...extra,
  ];
}

function fullAddress(ctx: BookingEmailContext): string {
  return `${ctx.spaceAddress}, ${ctx.spacePostalCode} ${ctx.spaceCity}`;
}

// ---------------------------------------------------------------------------
// Booking lifecycle
// ---------------------------------------------------------------------------

export function bookingRequestedTemplate(ctx: BookingEmailContext): RenderedEmail {
  return renderEmail(ctx.clientEmail, `Votre demande pour ${ctx.spaceName} a été envoyée`, {
    greeting: `Bonjour ${ctx.clientName},`,
    paragraphs: [
      `Votre demande de réservation pour « ${ctx.spaceName} » ${slot(ctx)} a bien été envoyée à ${ctx.partnerOrgName}.`,
    ],
    details: bookingDetails(ctx, [{ label: "Montant", value: formatCents(ctx.priceAmountCents) }]),
    closing: [
      "Vous ne serez débité qu'une fois la demande acceptée. Vous recevrez un e-mail dès que l'hôte aura répondu.",
    ],
    action: { label: "Suivre ma demande", path: CLIENT_BOOKINGS_PATH },
  });
}

export function bookingRequestReceivedTemplate(ctx: BookingEmailContext): RenderedEmail {
  return renderEmail(ctx.partnerEmail, `Nouvelle demande de réservation — ${ctx.spaceName}`, {
    greeting: "Bonjour,",
    paragraphs: [`${ctx.clientName} souhaite réserver « ${ctx.spaceName} » ${slot(ctx)}.`],
    details: bookingDetails(ctx, [
      { label: "Montant", value: `${formatCents(ctx.priceAmountCents)} (commission incluse)` },
    ]),
    closing: ["Acceptez ou refusez cette demande depuis votre espace bailleur."],
    action: { label: "Répondre à la demande", path: LANDLORD_REQUESTS_PATH },
  });
}

/** Sent once the payment is captured. Carries the address, the access
 * instructions and the host's contact details — the client needs all three
 * to actually get in, and none of them is public before confirmation. */
export function bookingConfirmedTemplate(ctx: BookingEmailContext): RenderedEmail {
  const details = bookingDetails(ctx, [
    { label: "Adresse", value: fullAddress(ctx) },
    { label: "Hôte", value: ctx.partnerOrgName },
    { label: "Contact de l'hôte", value: ctx.partnerEmail },
  ]);
  if (ctx.accessInstructions) details.push({ label: "Instructions d'accès", value: ctx.accessInstructions });
  details.push({ label: "Montant débité", value: formatCents(ctx.priceAmountCents) });
  return renderEmail(ctx.clientEmail, `Réservation confirmée — ${ctx.spaceName}`, {
    greeting: `Bonjour ${ctx.clientName},`,
    paragraphs: [`Votre réservation pour « ${ctx.spaceName} » ${slot(ctx)} est confirmée.`],
    details,
    closing: ["Pour toute question pratique, vous pouvez écrire à l'hôte depuis la messagerie de la réservation."],
    action: { label: "Voir ma réservation", path: CLIENT_BOOKINGS_PATH },
  });
}

export function bookingRejectedTemplate(ctx: BookingEmailContext): RenderedEmail {
  return renderEmail(ctx.clientEmail, `Votre demande pour ${ctx.spaceName} n'a pas été acceptée`, {
    greeting: `Bonjour ${ctx.clientName},`,
    paragraphs: [
      `${ctx.partnerOrgName} n'a pas pu donner suite à votre demande de réservation pour « ${ctx.spaceName} » ${slot(ctx)}.`,
      "Aucun montant ne vous a été débité.",
    ],
    closing: ["N'hésitez pas à rechercher un autre espace disponible."],
    action: { label: "Rechercher un espace", path: "/search" },
  });
}

/** No landlord answer in time (or the slot started first): the hold on the
 * card is released. */
export function bookingExpiredTemplate(ctx: BookingEmailContext): RenderedEmail {
  return renderEmail(ctx.clientEmail, `Votre demande pour ${ctx.spaceName} a expiré`, {
    greeting: `Bonjour ${ctx.clientName},`,
    paragraphs: [
      `Votre demande de réservation pour « ${ctx.spaceName} » ${slot(ctx)} n'a pas reçu de réponse à temps et a expiré.`,
      "Aucun montant ne vous a été débité : l'autorisation sur votre carte est levée.",
    ],
    closing: ["N'hésitez pas à refaire une demande ou à choisir un autre espace."],
    action: { label: "Rechercher un espace", path: "/search" },
  });
}

/** The day before a confirmed booking — same practical details as the
 * confirmation, since that one may be weeks old by now. */
export function bookingReminderTemplate(ctx: BookingEmailContext): RenderedEmail {
  const details = bookingDetails(ctx, [
    { label: "Adresse", value: fullAddress(ctx) },
    { label: "Hôte", value: ctx.partnerOrgName },
    { label: "Contact de l'hôte", value: ctx.partnerEmail },
  ]);
  if (ctx.accessInstructions) details.push({ label: "Instructions d'accès", value: ctx.accessInstructions });
  return renderEmail(ctx.clientEmail, `Rappel : votre réservation demain — ${ctx.spaceName}`, {
    greeting: `Bonjour ${ctx.clientName},`,
    paragraphs: [`Petit rappel : votre réservation pour « ${ctx.spaceName} » commence bientôt.`],
    details,
    action: { label: "Voir ma réservation", path: CLIENT_BOOKINGS_PATH },
  });
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

export function bookingCancelledByClientTemplate(ctx: CancellationEmailContext): RenderedEmail {
  return renderEmail(ctx.clientEmail, `Annulation confirmée — ${ctx.spaceName}`, {
    greeting: `Bonjour ${ctx.clientName},`,
    paragraphs: [`Votre réservation pour « ${ctx.spaceName} » ${slot(ctx)} est annulée.`, refundSentence(ctx)],
    action: { label: "Mes réservations", path: CLIENT_BOOKINGS_PATH },
  });
}

export function bookingCancelledByClientNoticeTemplate(ctx: CancellationEmailContext): RenderedEmail {
  return renderEmail(ctx.partnerEmail, `Réservation annulée par le client — ${ctx.spaceName}`, {
    greeting: "Bonjour,",
    paragraphs: [
      `${ctx.clientName} a annulé sa réservation pour « ${ctx.spaceName} » ${slot(ctx)}.`,
      "Le créneau est de nouveau disponible à la réservation.",
    ],
    action: { label: "Voir mes réservations", path: LANDLORD_REQUESTS_PATH },
  });
}

export function bookingCancelledByLandlordTemplate(ctx: CancellationEmailContext): RenderedEmail {
  return renderEmail(ctx.clientEmail, `Votre réservation pour ${ctx.spaceName} est annulée`, {
    greeting: `Bonjour ${ctx.clientName},`,
    paragraphs: [
      `${ctx.partnerOrgName} a dû annuler votre réservation pour « ${ctx.spaceName} » ${slot(ctx)}.`,
      ctx.beforeCapture
        ? "Aucun montant ne vous a été débité."
        : `Vous êtes remboursé intégralement : ${formatCents(ctx.refundAmountCents)}, sous quelques jours selon votre banque.`,
    ],
    closing: ["Toutes nos excuses pour ce contretemps. N'hésitez pas à choisir un autre espace."],
    action: { label: "Rechercher un espace", path: "/search" },
  });
}

export function bookingCancelledByLandlordNoticeTemplate(ctx: CancellationEmailContext): RenderedEmail {
  return renderEmail(ctx.partnerEmail, `Annulation enregistrée — ${ctx.spaceName}`, {
    greeting: "Bonjour,",
    paragraphs: [
      `Vous avez annulé la réservation de ${ctx.clientName} pour « ${ctx.spaceName} » ${slot(ctx)}.`,
      ctx.beforeCapture
        ? "Aucun paiement n'avait encore été encaissé."
        : `Le client est remboursé intégralement (${formatCents(ctx.refundAmountCents)}) ; le montant qui vous avait été versé est repris sur votre compte.`,
    ],
    action: { label: "Voir mes réservations", path: LANDLORD_REQUESTS_PATH },
  });
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

/** Deliberately without the message itself: an e-mail is copied, forwarded
 * and indexed; the conversation stays in the app, behind authentication. */
export function newMessageTemplate(ctx: {
  to: string;
  senderLabel: string;
  spaceName: string;
  bookingId: string;
}): RenderedEmail {
  return renderEmail(ctx.to, `Nouveau message — ${ctx.spaceName}`, {
    greeting: "Bonjour,",
    paragraphs: [
      `${ctx.senderLabel} vous a écrit au sujet de la réservation « ${ctx.spaceName} ».`,
      "Pour des raisons de confidentialité, le contenu du message n'est pas repris dans cet e-mail.",
    ],
    action: { label: "Lire le message", path: `/app/messages/${encodeURIComponent(ctx.bookingId)}` },
  });
}

// ---------------------------------------------------------------------------
// Landlord verification and listings moderation
// ---------------------------------------------------------------------------

export function verificationApprovedTemplate(ctx: { to: string; organizationName: string }): RenderedEmail {
  return renderEmail(ctx.to, "Votre dossier bailleur est validé", {
    greeting: "Bonjour,",
    paragraphs: [
      `Le dossier de vérification de ${ctx.organizationName} a été validé par l'équipe OfficeFlex.`,
      "Vos annonces peuvent désormais être soumises à la publication.",
    ],
    action: { label: "Gérer mes annonces", path: "/app/landlord/listings" },
  });
}

export function verificationRejectedTemplate(ctx: {
  to: string;
  organizationName: string;
  reason: string;
}): RenderedEmail {
  return renderEmail(ctx.to, "Votre dossier bailleur doit être complété", {
    greeting: "Bonjour,",
    paragraphs: [`Le dossier de vérification de ${ctx.organizationName} n'a pas pu être validé en l'état.`],
    details: [{ label: "Motif", value: ctx.reason }],
    closing: ["Vous pouvez corriger votre dossier et le soumettre à nouveau."],
    action: { label: "Reprendre mon dossier", path: "/app/landlord/verification" },
  });
}

export function spacePublishedTemplate(ctx: { to: string; spaceName: string }): RenderedEmail {
  return renderEmail(ctx.to, `Votre annonce est en ligne — ${ctx.spaceName}`, {
    greeting: "Bonjour,",
    paragraphs: [`Votre annonce « ${ctx.spaceName} » a été validée : elle est désormais visible et réservable.`],
    action: { label: "Voir mes annonces", path: "/app/landlord/listings" },
  });
}

export function spaceRejectedTemplate(ctx: { to: string; spaceName: string; reason?: string | null }): RenderedEmail {
  return renderEmail(ctx.to, `Votre annonce n'a pas été validée — ${ctx.spaceName}`, {
    greeting: "Bonjour,",
    paragraphs: [`Votre annonce « ${ctx.spaceName} » n'a pas été validée par notre équipe de modération.`],
    details: ctx.reason ? [{ label: "Motif", value: ctx.reason }] : undefined,
    closing: ["Vous pouvez la modifier puis la soumettre à nouveau."],
    action: { label: "Modifier mon annonce", path: "/app/landlord/listings" },
  });
}

export function spaceUnpublishedTemplate(ctx: { to: string; spaceName: string; reason: string }): RenderedEmail {
  return renderEmail(ctx.to, `Votre annonce a été retirée — ${ctx.spaceName}`, {
    greeting: "Bonjour,",
    paragraphs: [
      `Votre annonce « ${ctx.spaceName} » a été retirée du catalogue par notre équipe de modération.`,
      "Les réservations déjà confirmées ne sont pas annulées.",
    ],
    details: [{ label: "Motif", value: ctx.reason }],
    closing: ["Vous pouvez la corriger puis la soumettre à nouveau."],
    action: { label: "Modifier mon annonce", path: "/app/landlord/listings" },
  });
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export function organizationSuspendedTemplate(ctx: {
  to: string;
  organizationName: string;
  reason: string;
}): RenderedEmail {
  return renderEmail(ctx.to, "Votre compte bailleur est suspendu", {
    greeting: "Bonjour,",
    paragraphs: [
      `Le compte bailleur de ${ctx.organizationName} a été suspendu par l'équipe OfficeFlex. Vos annonces ne sont plus visibles ni réservables.`,
    ],
    details: [{ label: "Motif", value: ctx.reason }],
    closing: ["Pour toute question, répondez via le formulaire de contact."],
    action: { label: "Nous contacter", path: "/contact" },
  });
}

export function organizationReactivatedTemplate(ctx: { to: string; organizationName: string }): RenderedEmail {
  return renderEmail(ctx.to, "Votre compte bailleur est réactivé", {
    greeting: "Bonjour,",
    paragraphs: [
      `Le compte bailleur de ${ctx.organizationName} a été réactivé. Vos annonces validées sont de nouveau visibles.`,
    ],
    action: { label: "Mon espace bailleur", path: "/app/landlord/listings" },
  });
}

// ---------------------------------------------------------------------------
// Disputes, refunds, chargebacks, commission statements
// ---------------------------------------------------------------------------

export type DisputeEmailContext = {
  spaceName: string;
  startsAt: Date;
  endsAt: Date;
  bookingId: string;
  raisedByLabel: string;
};

export function disputeOpenedTemplate(
  ctx: DisputeEmailContext & { to: string; audience: "party" | "admin" }
): RenderedEmail {
  return renderEmail(ctx.to, `Litige ouvert — ${ctx.spaceName}`, {
    greeting: "Bonjour,",
    paragraphs: [
      `Un litige a été signalé par ${ctx.raisedByLabel} sur la réservation « ${ctx.spaceName} » ${slot(ctx)}.`,
      ctx.audience === "admin"
        ? "Il attend une prise en charge dans le back-office."
        : "L'équipe OfficeFlex va l'examiner et reviendra vers vous. Vous pouvez échanger avec l'autre partie depuis la messagerie de la réservation.",
    ],
    action:
      ctx.audience === "admin"
        ? { label: "Ouvrir les litiges", path: "/admin/disputes" }
        : { label: "Voir la conversation", path: `/app/messages/${encodeURIComponent(ctx.bookingId)}` },
  });
}

export function disputeResolvedTemplate(ctx: {
  to: string;
  spaceName: string;
  outcome: "REFUND" | "NO_ACTION";
  notes: string;
  refundAmountCents?: number | null;
}): RenderedEmail {
  const decision =
    ctx.outcome === "REFUND"
      ? `Décision : remboursement${ctx.refundAmountCents ? ` de ${formatCents(ctx.refundAmountCents)}` : ""}.`
      : "Décision : clôture sans remboursement.";
  return renderEmail(ctx.to, `Litige résolu — ${ctx.spaceName}`, {
    greeting: "Bonjour,",
    paragraphs: [`Le litige concernant la réservation « ${ctx.spaceName} » a été traité par l'équipe OfficeFlex.`, decision],
    details: [{ label: "Commentaire", value: ctx.notes }],
    action: { label: "Mes réservations", path: CLIENT_BOOKINGS_PATH },
  });
}

export function refundIssuedTemplate(ctx: {
  to: string;
  clientName: string;
  spaceName: string;
  amountCents: number;
}): RenderedEmail {
  return renderEmail(ctx.to, `Remboursement émis — ${ctx.spaceName}`, {
    greeting: `Bonjour ${ctx.clientName},`,
    paragraphs: [
      `Un remboursement de ${formatCents(ctx.amountCents)} a été émis pour votre réservation « ${ctx.spaceName} ».`,
      "Il apparaîtra sur votre moyen de paiement sous quelques jours, selon votre banque.",
    ],
    action: { label: "Mes réservations", path: CLIENT_BOOKINGS_PATH },
  });
}

export function commissionStatementIssuedTemplate(ctx: {
  to: string;
  organizationName: string;
  periodLabel: string;
  totalCommissionAmountCents: number;
}): RenderedEmail {
  return renderEmail(ctx.to, `Relevé de commission — ${ctx.periodLabel}`, {
    greeting: "Bonjour,",
    paragraphs: [`Le relevé de commission de ${ctx.organizationName} pour ${ctx.periodLabel} est disponible.`],
    details: [
      { label: "Période", value: ctx.periodLabel },
      { label: "Commission", value: formatCents(ctx.totalCommissionAmountCents) },
    ],
    closing: ["Cette commission a déjà été prélevée lors de chaque paiement : aucun règlement n'est attendu."],
    action: { label: "Voir ma comptabilité", path: "/app/landlord/revenue" },
  });
}

export function chargebackReceivedTemplate(ctx: {
  to: string;
  audience: "landlord" | "admin";
  organizationName: string;
  spaceName: string;
  amountCents: number;
  reason: string;
}): RenderedEmail {
  return renderEmail(ctx.to, `Contestation de paiement — ${ctx.spaceName}`, {
    greeting: "Bonjour,",
    paragraphs: [
      ctx.audience === "admin"
        ? `Une contestation bancaire (chargeback) a été ouverte sur un paiement de ${ctx.organizationName}.`
        : `Le titulaire de la carte a contesté auprès de sa banque un paiement pour votre espace « ${ctx.spaceName} ».`,
      ctx.audience === "admin"
        ? "Les justificatifs doivent être déposés dans le tableau de bord Stripe avant l'échéance indiquée par Stripe."
        : "L'équipe OfficeFlex traite la contestation ; elle pourra vous demander des justificatifs (échanges, preuve de présence).",
    ],
    details: [
      { label: "Espace", value: ctx.spaceName },
      { label: "Montant contesté", value: formatCents(ctx.amountCents) },
      { label: "Motif bancaire", value: ctx.reason },
    ],
    action:
      ctx.audience === "admin"
        ? { label: "Ouvrir les contestations", path: "/admin/stripe-disputes" }
        : { label: "Mon espace bailleur", path: LANDLORD_REQUESTS_PATH },
  });
}

// ---------------------------------------------------------------------------
// Support
// ---------------------------------------------------------------------------

/**
 * Acknowledges a "Nous contacter" ticket. The form is public, so this
 * e-mail can be triggered towards any address: it deliberately repeats
 * none of what was typed (subject, message) — otherwise the form would be
 * a free relay for spam sent under our name. Only the reference.
 */
export function supportTicketAckTemplate(ctx: { to: string; ticketId: string }): RenderedEmail {
  return renderEmail(ctx.to, "Nous avons bien reçu votre message", {
    greeting: "Bonjour,",
    paragraphs: [
      "Votre message a bien été transmis à l'équipe OfficeFlex. Nous vous répondrons par e-mail dans les meilleurs délais.",
    ],
    details: [{ label: "Référence", value: ctx.ticketId.slice(0, 8).toUpperCase() }],
    closing: ["Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail."],
  });
}

export function supportReplyTemplate(ctx: {
  to: string;
  ticketId: string;
  subject: string;
  reply: string;
}): RenderedEmail {
  return renderEmail(ctx.to, `Réponse à votre demande : ${ctx.subject}`, {
    greeting: "Bonjour,",
    paragraphs: [ctx.reply],
    details: [{ label: "Référence", value: ctx.ticketId.slice(0, 8).toUpperCase() }],
    closing: ["Pour compléter votre demande, utilisez à nouveau le formulaire de contact en rappelant cette référence."],
    action: { label: "Nous contacter", path: "/contact" },
  });
}
