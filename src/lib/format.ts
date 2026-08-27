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
