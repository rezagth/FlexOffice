"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

export type NotificationListItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

/**
 * Marks a notification read optimistically on click/navigation; the
 * network call is fire-and-forget (startTransition, no error surfaced) —
 * the worst case is a notification that still shows unread next visit,
 * never a blocked click.
 */
export function NotificationList({ notifications }: { notifications: NotificationListItem[] }) {
  const [items, setItems] = useState(notifications);
  const [isPending, startTransition] = useTransition();

  function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    startTransition(async () => {
      await fetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => {});
    });
  }

  function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    startTransition(async () => {
      await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
    });
  }

  const hasUnread = items.some((n) => !n.read);

  return (
    <div className="flex flex-col gap-4">
      {hasUnread && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={markAllRead} disabled={isPending}>
            Tout marquer comme lu
          </Button>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {items.map((notification) => {
          const body = (
            <Card
              className={
                notification.read
                  ? "flex flex-col gap-1 p-4"
                  : "flex flex-col gap-1 border-primary/60 bg-primary/5 p-4"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-foreground">{notification.title}</p>
                {!notification.read && (
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full bg-primary"
                  />
                )}
                {!notification.read && <span className="sr-only">Non lue</span>}
              </div>
              {notification.body && (
                <p className="text-sm text-muted-foreground">{notification.body}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {formatDateTime(new Date(notification.createdAt))}
              </p>
            </Card>
          );

          return (
            <li key={notification.id}>
              {notification.link ? (
                <Link
                  href={notification.link}
                  onClick={() => markRead(notification.id)}
                  className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {body}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => markRead(notification.id)}
                  disabled={notification.read}
                  className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
