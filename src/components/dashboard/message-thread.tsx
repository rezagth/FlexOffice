"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

type Message = {
  id: string;
  body: string;
  senderUserId: string;
  createdAt: string;
  sender: { name: string };
};

/**
 * A plain reload-to-refresh thread, no websocket — consistent with the rest
 * of this dependency-light dashboard. `router.refresh()` re-runs the
 * server component after a send, so a second browser tab on the same
 * conversation needs its own reload to see it, same tradeoff as every
 * other page here.
 */
export function MessageThread({
  bookingId,
  currentUserId,
  initialMessages,
}: {
  bookingId: string;
  currentUserId: string;
  initialMessages: Message[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        const responseBody = await response.json().catch(() => null);
        setError(responseBody?.error?.message ?? "L'envoi a échoué.");
        return;
      }
      setBody("");
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {initialMessages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun message pour l&apos;instant. Écrivez le premier.
          </p>
        ) : (
          initialMessages.map((message) => {
            const isMine = message.senderUserId === currentUserId;
            return (
              <div
                key={message.id}
                className={`flex flex-col gap-1 rounded-xl px-4 py-2 ${
                  isMine ? "self-end bg-primary/10 text-right" : "self-start bg-muted"
                } max-w-[80%]`}
              >
                <p className="text-sm text-foreground">{message.body}</p>
                <p className="text-xs text-muted-foreground">
                  {isMine ? "Vous" : message.sender.name} ·{" "}
                  {formatDateTime(new Date(message.createdAt))}
                </p>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          className="flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground"
          placeholder="Écrire un message…"
        />
        <Button disabled={pending || body.trim().length === 0} onClick={handleSend}>
          {pending ? "…" : "Envoyer"}
        </Button>
      </div>
    </div>
  );
}
