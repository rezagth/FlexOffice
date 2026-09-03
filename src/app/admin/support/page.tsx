import { requirePageAdmin } from "@/server/auth/page-guards";
import { listTickets } from "@/server/domains/support/tickets";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { CloseTicketButton } from "@/components/dashboard/close-ticket-button";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Support — Admin OfficeFlex" };
export const dynamic = "force-dynamic";

/**
 * Tickets from "Nous contacter", open first. No reply-by-email here: this
 * dépôt has no real transactional email provider yet (see the booking
 * confirmation emails, log-only) — a ticket is worked manually from what's
 * shown here, not through a fake "sent" state.
 */
export default async function AdminSupportPage() {
  await requirePageAdmin();
  const tickets = await listTickets();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Support</h1>

      {tickets.length === 0 ? (
        <EmptyState
          title="Aucun ticket pour l'instant"
          description="Les messages envoyés depuis « Nous contacter » apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{ticket.subject}</p>
                  <p className="text-sm text-muted-foreground">
                    {ticket.email} · {formatDateTime(ticket.createdAt)}
                  </p>
                </div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {ticket.status === "OPEN" ? "Ouvert" : "Clos"}
                </p>
              </div>
              <p className="text-sm text-foreground">{ticket.message}</p>
              {ticket.status === "OPEN" && (
                <div>
                  <CloseTicketButton ticketId={ticket.id} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
