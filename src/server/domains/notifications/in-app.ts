import type { NotificationType } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { logError } from "@/server/lib/logger";

const NOTIFICATIONS_PAGE_SIZE = 30;

/**
 * The in-app notification center (PRD V1.1, R67-R69).
 *
 * Deliberately thin: one flat table, no per-type template resolved at read
 * time. `title`/`body` are the final French text, written once here by the
 * caller that already has the full context (a booking, a verification
 * decision) — never recomputed from the notification row later. That is
 * also the whole enforcement of R69 ("no phone number or SIRET in the
 * text"): the caller decides what the text says, so it is reviewed once,
 * where it is written, not scattered across every future read.
 */
export type CreateNotificationInput = {
  recipientProfileId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** A relative in-app path only (`/app/...`) — never an absolute URL: this
   * is what the notification panel navigates to on click, and an absolute
   * URL here would be an open-redirect surface dressed up as a feature. */
  link?: string;
};

function assertRelativeLink(link: string | undefined): void {
  if (link !== undefined && !link.startsWith("/")) {
    throw new Error(`Notification link must be a relative path, got: ${link}`);
  }
}

/**
 * Best-effort, like every other notification in this codebase
 * (send-safely.ts, send-notifications.ts): a failed write here must never
 * fail the booking or verification transition it announces.
 */
export async function createInAppNotification(input: CreateNotificationInput): Promise<void> {
  assertRelativeLink(input.link);
  try {
    await prisma.notification.create({
      data: {
        recipientProfileId: input.recipientProfileId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
      },
    });
  } catch (error) {
    logError({ event: "notification.create_failed", error, user_id: input.recipientProfileId });
  }
}

/** A visitor's own notifications, most recent first. Scoped by `userId` from
 * the verified session — never by an id a caller supplies (R69: readable
 * only by its recipient). */
export async function listNotifications(userId: string, limit = NOTIFICATIONS_PAGE_SIZE) {
  return prisma.notification.findMany({
    where: { recipientProfileId: userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.notification.count({ where: { recipientProfileId: userId, readAt: null } });
}

/**
 * Marks one notification read. Scoped by `recipientProfileId: userId` in the
 * `where`, never checked after a plain `findUnique` by id alone — the same
 * object-ownership rule as every other identifier-bearing route in this
 * codebase (security guardrails, piège n°3): a notification id from another
 * account matches nothing here, rather than leaking whether it exists.
 */
export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, recipientProfileId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { recipientProfileId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}
