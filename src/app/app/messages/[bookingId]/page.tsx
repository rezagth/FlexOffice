import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageAuth } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { listMessages } from "@/server/domains/messaging/conversation";
import { MessageThread } from "@/components/dashboard/message-thread";
import { Card } from "@/components/ui/card";
import { NotFoundError } from "@/server/lib/errors";

export const metadata = { title: "Conversation — OfficeFlex" };
export const dynamic = "force-dynamic";

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const ctx = await requirePageAuth({ redirectTo: "/app/messages" });
  const { bookingId } = await params;

  // Re-derives the same scoping listMessages() itself checks, only to
  // render the booking's own name above the thread — the actual
  // authorization decision still lives in one place (conversation.ts).
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      OR: [
        { clientUserId: ctx.userId },
        ...(ctx.activeOrgId ? [{ organizationId: ctx.activeOrgId }] : []),
      ],
    },
    include: { space: true, clientUser: { select: { name: true } } },
  });
  if (!booking) notFound();

  let messages;
  try {
    messages = await listMessages({
      bookingId,
      userId: ctx.userId,
      activeOrgId: ctx.activeOrgId ?? null,
    });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/messages" className="text-xs text-muted-foreground hover:underline">
          ← Messages
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">
          {booking.space.name}
          {ctx.activeMode === "LANDLORD" ? ` — ${booking.clientUser.name}` : ""}
        </h1>
      </div>

      <Card className="p-5">
        <MessageThread
          bookingId={bookingId}
          currentUserId={ctx.userId}
          initialMessages={messages.map((m) => ({
            id: m.id,
            body: m.body,
            senderUserId: m.senderUserId,
            createdAt: m.createdAt.toISOString(),
            sender: m.sender,
          }))}
        />
      </Card>
    </div>
  );
}
