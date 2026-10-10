import { requirePageAdmin } from "@/server/auth/page-guards";
import { listTickets } from "@/server/domains/support/tickets";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { CloseTicketButton } from "@/components/dashboard/close-ticket-button";
import { SupportReplyForm } from "@/components/dashboard/support-reply-form";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Support — Admin MakomSpace" };
export const dynamic = "force-dynamic";

/**
 * Tickets from "Nous contacter", open first. An administrator answers from
 * here: the reply is kept in the ticket's history and e-mailed to the
 * address the ticket came from — and the history says whether that e-mail
 * actually left, rather than showing a reply as delivered when it was not.
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
              <p className="whitespace-pre-wrap text-sm text-foreground">{ticket.message}</p>
              {ticket.replies.length > 0 && (
                <ol className="flex flex-col gap-2 border-l-2 border-border pl-3" aria-label="Réponses envoyées">
                  {ticket.replies.map((reply) => (
                    <li key={reply.id} className="flex flex-col gap-1">
                      <p className="text-xs text-muted-foreground">
                        {reply.author?.name ?? "Administrateur"} · {formatDateTime(reply.createdAt)} ·{" "}
                        {reply.emailedAt ? "envoyée par e-mail" : "e-mail non parti"}
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-foreground">{reply.body}</p>
                    </li>
                  ))}
                </ol>
              )}
              <SupportReplyForm ticketId={ticket.id} email={ticket.email} isOpen={ticket.status === "OPEN"} />
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
