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
  PENDING: "En attente",
  CONFIRMED: "Confirmée",
  CANCELLED: "Annulée",
  REJECTED: "Refusée",
  COMPLETED: "Terminée",
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
