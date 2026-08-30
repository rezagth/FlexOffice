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
