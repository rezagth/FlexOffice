import Link from "next/link";
import { requirePageAuth } from "@/server/auth/page-guards";
import { listMessageableBookings } from "@/server/domains/messaging/conversation";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Messages — OfficeFlex" };
export const dynamic = "force-dynamic";

/**
 * One row per reservation the caller can message — client or landlord side,
 * whichever `activeMode` they're in. A conversation is created lazily on
 * first message (see conversation.ts), so a booking with none yet still
 * shows up here: it is reachable, not "coming soon".
 */
export default async function MessagesPage() {
  const ctx = await requirePageAuth({ redirectTo: "/app/messages" });
  const bookings = await listMessageableBookings({
    userId: ctx.userId,
    activeOrgId: ctx.activeOrgId ?? null,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">
        {ctx.activeMode === "LANDLORD" ? "Messagerie" : "Messages"}
      </h1>

      {bookings.length === 0 ? (
        <EmptyState
          title="Aucune conversation pour l'instant"
          description="Une conversation apparaît ici pour chaque réservation, dès qu'un message est échangé."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {bookings.map((booking) => {
            const lastMessage = booking.conversation?.messages[0];
            return (
              <Link key={booking.id} href={`/app/messages/${booking.id}`} className="block">
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted">
                  <div>
                    <p className="font-medium text-foreground">
                      {booking.space.name}
                      {ctx.activeMode === "LANDLORD" ? ` — ${booking.clientUser.name}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {lastMessage ? lastMessage.body : "Aucun message pour l'instant"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(lastMessage?.createdAt ?? booking.createdAt)}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
