import { formatCents, formatDateTime } from "@/lib/format";
import { renderEmail } from "./layout";
import { sendSafely } from "./send-safely";

/** "Votre versement est parti" — sent to the landlord's organization when a
 * payout transfer succeeds. Best effort (send-safely.ts). */
export async function sendPayoutPaid(params: {
  to: string;
  organizationName: string;
  amountCents: number;
  scheduledFor: Date;
}): Promise<void> {
  await sendSafely(
    () =>
      renderEmail(params.to, `Versement de ${formatCents(params.amountCents)} émis`, {
        greeting: "Bonjour,",
        paragraphs: [
          `Nous avons émis votre versement de ${formatCents(params.amountCents)} pour ${params.organizationName}.`,
          "Selon votre banque, il apparaît sur votre compte sous quelques jours ouvrés. Le détail réservation par réservation est disponible dans votre espace.",
        ],
        details: [
          { label: "Période de versement", value: formatDateTime(params.scheduledFor) },
          { label: "Montant", value: formatCents(params.amountCents) },
        ],
        action: { label: "Voir mes versements", path: "/app/landlord/payouts" },
      }),
    "email.payout_paid.failed"
  );
}
