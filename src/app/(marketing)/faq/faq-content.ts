import {
  FULL_REFUND_MIN_HOURS,
  PARTIAL_REFUND_MIN_HOURS,
  PARTIAL_REFUND_PERCENT,
} from "@/lib/cancellation-policy";
import { REVIEW_WINDOW_DAYS } from "@/lib/review-policy";
import { COMMISSION_RATE } from "@/server/domains/payments/constants";
import { BOOKING_EXPIRY_HOURS } from "@/server/domains/bookings/expire-stale";

/**
 * Help content of /faq (and its FAQPage structured data). Every figure is
 * read from the constant the server applies — the commission, the request
 * expiry, the refund tiers, the review window — so the help can never
 * promise something the platform does not do. Change a rule there, the
 * answer follows.
 *
 * `answer` is plain text (it also feeds schema.org); `links` are rendered
 * after it.
 */

export type FaqItem = {
  id: string;
  question: string;
  answer: string[];
  links?: { href: string; label: string }[];
};

export type FaqCategory = { id: string; title: string; items: FaqItem[] };

const commission = `${Math.round(COMMISSION_RATE * 100)} %`;

export const FAQ: FaqCategory[] = [
  {
    id: "reserver",
    title: "Réserver un espace",
    items: [
      {
        id: "compte",
        question: "Faut-il un compte pour chercher un espace ?",
        answer: [
          "Non : la recherche et les fiches des espaces sont accessibles sans inscription. Un compte est demandé au moment de réserver, pour que l'entreprise qui vous accueille sache à qui elle a affaire.",
        ],
        links: [{ href: "/search", label: "Rechercher un espace" }],
      },
      {
        id: "deroulement",
        question: "Comment se passe une réservation ?",
        answer: [
          "Choisissez un créneau (demi-journée ou journée), indiquez le nombre de participants et l'objet de la réunion, puis renseignez votre carte. Votre demande est envoyée à l'entreprise qui propose l'espace.",
          `Elle l'accepte ou la refuse. Sans réponse sous ${BOOKING_EXPIRY_HOURS} h (ou avant le début du créneau s'il est plus proche), la demande expire. Une fois acceptée, vous recevez par e-mail la confirmation, l'adresse et les instructions d'accès.`,
        ],
      },
      {
        id: "debit",
        question: "Quand suis-je débité ?",
        answer: [
          "Seulement quand l'entreprise accepte votre demande. En attendant, le montant est simplement réservé sur votre carte (autorisation). Si la demande est refusée ou expire, l'autorisation est levée et rien n'est débité.",
          "Le paiement est traité par Stripe : MakomSpace ne voit ni ne conserve jamais votre numéro de carte.",
        ],
      },
      {
        id: "prix",
        question: "Le prix affiché comprend-il des frais ?",
        answer: [
          `Oui, le prix affiché est le prix que vous payez. Il comprend les frais de service de MakomSpace (${commission}), qui rémunèrent la plateforme : recherche, paiement sécurisé, vérification des entreprises, support.`,
        ],
      },
      {
        id: "annuler",
        question: "Puis-je annuler ma réservation ?",
        answer: [
          "Oui, depuis « Mes réservations ». Une demande pas encore acceptée s'annule toujours gratuitement.",
          `Pour une réservation confirmée : plus de ${FULL_REFUND_MIN_HOURS} h avant le début, la location vous est remboursée intégralement ; entre ${FULL_REFUND_MIN_HOURS} h et ${PARTIAL_REFUND_MIN_HOURS} h, ${PARTIAL_REFUND_PERCENT} % ; moins de ${PARTIAL_REFUND_MIN_HOURS} h avant, aucun remboursement. Les frais de service ne sont pas remboursables. Le montant exact est affiché avant que vous confirmiez l'annulation.`,
          "Si c'est l'entreprise qui annule, vous êtes remboursé intégralement, frais de service compris.",
        ],
        links: [{ href: "/cgv", label: "Conditions générales de vente" }],
      },
      {
        id: "facture",
        question: "Comment obtenir ma facture ?",
        answer: [
          "Elle est émise automatiquement au moment du paiement, au nom de l'entreprise qui vous accueille, et téléchargeable en PDF dans « Factures ». Un avoir est émis en cas de remboursement.",
        ],
        links: [{ href: "/app/invoices", label: "Mes factures" }],
      },
      {
        id: "probleme",
        question: "Un problème sur place, que faire ?",
        answer: [
          "Écrivez d'abord à l'entreprise depuis la messagerie de la réservation : c'est le plus rapide. Si vous ne trouvez pas d'accord, signalez un litige depuis « Mes réservations » : l'équipe MakomSpace examine la situation avec les deux parties et peut décider d'un remboursement.",
        ],
        links: [{ href: "/app/bookings", label: "Mes réservations" }],
      },
      {
        id: "avis",
        question: "Comment fonctionnent les avis ?",
        answer: [
          `Seul le client d'une réservation qui a eu lieu peut laisser un avis, une fois par réservation, dans les ${REVIEW_WINDOW_DAYS} jours qui suivent : une note de 1 à 5 et un commentaire facultatif. Vous recevez une invitation par e-mail à la fin de votre réservation.`,
          "L'avis est publié avec votre prénom et l'initiale de votre nom. L'entreprise peut y répondre une fois. MakomSpace ne masque que les avis injurieux, hors sujet, publicitaires ou contenant des données personnelles — jamais un avis négatif sincère.",
        ],
      },
    ],
  },
  {
    id: "proposer",
    title: "Proposer un espace",
    items: [
      {
        id: "qui",
        question: "Qui peut proposer un espace ?",
        answer: [
          "Toute entreprise ou tout professionnel qui a le droit de louer l'espace : propriétaire, ou locataire autorisé à sous-louer. Les espaces sont loués à des professionnels, à la demi-journée ou à la journée, sans bail.",
        ],
        links: [{ href: "/proposer-un-espace", label: "Proposer un espace" }],
      },
      {
        id: "verification",
        question: "Pourquoi vérifiez-vous mon organisation, et avec quels documents ?",
        answer: [
          "La confiance entre entreprises est le cœur de MakomSpace : aucun espace n'est publié avant que l'organisation qui le propose soit vérifiée.",
          "Selon votre situation, nous demandons une pièce d'identité, un extrait Kbis, un justificatif de propriété ou une autorisation de sous-location. Ces documents sont stockés de façon privée et ne servent qu'à la vérification.",
        ],
      },
      {
        id: "cout",
        question: "Combien cela coûte-t-il ?",
        answer: [
          `L'inscription et la publication sont gratuites, sans abonnement. MakomSpace perçoit une commission de ${commission} sur chaque réservation payée, déduite automatiquement du montant qui vous est versé. Vous fixez librement vos prix à la demi-journée et à la journée.`,
        ],
      },
      {
        id: "paiement",
        question: "Quand et comment suis-je payé ?",
        answer: [
          "Le client est débité au moment où vous acceptez sa demande. Votre part (le prix, commission déduite) est transférée sur votre compte de paiement Stripe, puis versée sur votre compte bancaire selon le calendrier de versement de ce compte.",
          "Vous configurez ce compte une seule fois, depuis votre espace bailleur : Stripe vous demande vos coordonnées bancaires et vérifie votre identité, comme la réglementation l'impose.",
        ],
      },
      {
        id: "demandes",
        question: "Dois-je accepter toutes les demandes ?",
        answer: [
          `Non. Chaque demande vous est soumise et vous l'acceptez ou la refusez, en un clic. Sans réponse sous ${BOOKING_EXPIRY_HOURS} h, elle expire et le client n'est pas débité.`,
          "Vos horaires d'ouverture et vos périodes de fermeture bloquent automatiquement les créneaux : un même créneau ne peut jamais être réservé deux fois.",
        ],
      },
      {
        id: "annulation-bailleur",
        question: "Et si je dois annuler une réservation confirmée ?",
        answer: [
          "C'est possible depuis vos réservations, tant que le créneau n'a pas commencé. Le client est alors remboursé intégralement. Une annulation pénalise fortement la confiance : prévenez le client le plus tôt possible par la messagerie.",
        ],
      },
      {
        id: "factures-bailleur",
        question: "Qui émet les factures ?",
        answer: [
          "Pour vous simplifier la comptabilité, MakomSpace émet la facture de chaque réservation au nom et pour le compte de votre organisation (mandat de facturation), avec votre propre numérotation. Vous recevez chaque mois une facture de commission de MakomSpace. Tout est téléchargeable dans « Comptabilité », avec un export CSV.",
        ],
      },
    ],
  },
  {
    id: "compte",
    title: "Compte et données",
    items: [
      {
        id: "mot-de-passe",
        question: "J'ai oublié mon mot de passe.",
        answer: [
          "Sur la page de connexion, cliquez sur « Mot de passe oublié » : vous recevez un lien pour en choisir un nouveau. Vous pouvez aussi changer votre mot de passe et votre adresse e-mail depuis « Compte ».",
        ],
        links: [{ href: "/forgot-password", label: "Mot de passe oublié" }],
      },
      {
        id: "deux-modes",
        question: "Puis-je réserver et proposer des espaces avec le même compte ?",
        answer: [
          "Oui. Un même compte peut réserver des espaces et, après avoir activé le mode bailleur, en proposer. Vous passez de l'un à l'autre depuis le menu de votre espace.",
        ],
      },
      {
        id: "donnees",
        question: "Comment récupérer ou supprimer mes données ?",
        answer: [
          "Depuis « Compte », vous pouvez télécharger toutes les données liées à votre compte, ou demander sa suppression. La suppression n'est possible qu'une fois vos réservations en cours terminées ou annulées ; les pièces comptables (factures) sont conservées le temps imposé par la loi.",
        ],
        links: [{ href: "/confidentialite", label: "Politique de confidentialité" }],
      },
    ],
  },
];

/** schema.org FAQPage — the same questions and answers as the page. */
export function faqStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.flatMap((category) =>
      category.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer.join(" ") },
      }))
    ),
  };
}
