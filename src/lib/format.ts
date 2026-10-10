export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Shown while a captured payment's invoice has not been numbered yet (the
 * maintenance job issues it within minutes). */
export const INVOICE_PENDING_LABEL = "Facture en cours d'émission";

/**
 * Legal number of a payment's invoice. The number is allocated in the
 * database, sequentially per issuer, when the payment is captured
 * (server/domains/invoicing) — it is read here, never derived from the
 * payment id or its date as it used to be (`OF-<year>-<uuid>`, which was
 * not a legal numbering).
 */
export function invoiceNumber(payment: { invoice?: { number: string } | null }): string {
  return payment.invoice?.number ?? INVOICE_PENDING_LABEL;
}

export const INVOICE_KIND_LABELS: Record<string, string> = {
  INVOICE: "Facture",
  CREDIT_NOTE: "Avoir",
  COMMISSION_INVOICE: "Facture de commission",
};

export const SPACE_TYPE_LABELS: Record<string, string> = {
  MEETING_ROOM: "Salle de réunion",
  DESK: "Bureau",
  TRAINING_ROOM: "Espace de formation",
};

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  OFFICE: "Bureaux",
  COMMERCIAL: "Local commercial",
  COWORKING: "Coworking",
  MEETING_SPACE: "Espace de réunion",
  RESIDENTIAL: "Résidentiel",
  MIXED_USE: "Usage mixte",
  OTHER: "Autre",
};

export const PROPERTY_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Actif",
  ARCHIVED: "Archivé",
};

export const SPACE_AMENITY_LABELS: Record<string, string> = {
  WIFI: "Wifi",
  PARKING: "Parking",
  PROJECTOR: "Vidéoprojecteur",
  SCREEN: "Écran",
  PRINTER: "Imprimante",
  KITCHEN: "Cuisine",
  AIR_CONDITIONING: "Climatisation",
  WHEELCHAIR_ACCESS: "Accès PMR",
  COFFEE: "Café",
  PHONE_BOOTH: "Cabine téléphonique",
  WHITEBOARD: "Tableau blanc",
  OTHER: "Autre",
};

export const SPACE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  PENDING_REVIEW: "En attente de validation",
  PUBLISHED: "Publié",
  REJECTED: "Rejeté",
  ARCHIVED: "Archivé",
};

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: "Paiement en cours",
  PENDING: "En attente de l'hôte",
  CONFIRMED: "Confirmée",
  CANCELLED: "Annulée",
  REJECTED: "Refusée",
  COMPLETED: "Terminée",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  AWAITING_AUTHORIZATION: "Paiement en cours",
  REQUIRES_CAPTURE: "Autorisé, en attente de l'hôte",
  SUCCEEDED: "Payé",
  PARTIALLY_REFUNDED: "Partiellement remboursé",
  REFUNDED: "Remboursé",
  FAILED: "Non débité",
};

export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  PENDING_REVIEW: "En attente de vérification",
  IN_REVIEW: "En cours d'examen",
  APPROVED: "Vérifié",
  REJECTED: "Refusé",
  EXPIRED: "Expiré",
};

export const LANDLORD_ACTIVITY_TYPE_LABELS: Record<string, string> = {
  OWNER: "Propriétaire",
  OPERATOR: "Exploitant",
};

export const HOLDER_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Particulier",
  COMPANY: "Société",
};
