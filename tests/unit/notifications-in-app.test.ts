import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PRD V1.1, R67-R69 — a notification is readable (and markable-read) only by
 * its own recipient. The scoping is in the `where` clause itself, not a
 * check after a plain `findUnique` by id — the same object-ownership rule as
 * every other identifier-bearing route in this codebase (security
 * guardrails, piège n°3): an id belonging to another account matches
 * nothing here, rather than leaking whether it exists.
 */

const notificationCreate = vi.fn();
const notificationFindMany = vi.fn();
const notificationCount = vi.fn();
const notificationUpdateMany = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    notification: {
      create: notificationCreate,
      findMany: notificationFindMany,
      count: notificationCount,
      updateMany: notificationUpdateMany,
    },
  },
}));

const logError = vi.fn();
vi.mock("@/server/lib/logger", () => ({ logError }));

const {
  createInAppNotification,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = await import("@/server/domains/notifications/in-app");

beforeEach(() => {
  notificationCreate.mockReset().mockResolvedValue({});
  notificationFindMany.mockReset().mockResolvedValue([]);
  notificationCount.mockReset().mockResolvedValue(0);
  notificationUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  logError.mockReset();
});

describe("listNotifications", () => {
  it("scopes by the recipient from the session, never an id a caller could supply", async () => {
    await listNotifications("user-1");
    const args = notificationFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ recipientProfileId: "user-1" });
  });
});

describe("countUnreadNotifications", () => {
  it("counts only this user's unread notifications", async () => {
    await countUnreadNotifications("user-1");
    expect(notificationCount).toHaveBeenCalledWith({
      where: { recipientProfileId: "user-1", readAt: null },
    });
  });
});

describe("markNotificationRead", () => {
  it("scopes the update by recipientProfileId in the where clause, not after a bare lookup", async () => {
    await markNotificationRead("user-1", "notif-1");
    const args = notificationUpdateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "notif-1", recipientProfileId: "user-1", readAt: null });
  });

  it("another account's notification id matches nothing (updateMany with a mismatched where is a no-op)", async () => {
    notificationUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(markNotificationRead("someone-else", "notif-1")).resolves.toBeUndefined();
    expect(notificationUpdateMany).toHaveBeenCalledWith({
      where: { id: "notif-1", recipientProfileId: "someone-else", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe("markAllNotificationsRead", () => {
  it("only ever touches the caller's own rows", async () => {
    await markAllNotificationsRead("user-1");
    expect(notificationUpdateMany).toHaveBeenCalledWith({
      where: { recipientProfileId: "user-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe("createInAppNotification", () => {
  it("rejects an absolute URL as a link — only a relative in-app path is allowed", async () => {
    await expect(
      createInAppNotification({
        recipientProfileId: "user-1",
        type: "BOOKING_CONFIRMED",
        title: "Réservation confirmée",
        link: "https://evil.example/phish",
      })
    ).rejects.toThrow(/relative path/);
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it("accepts a relative link", async () => {
    await createInAppNotification({
      recipientProfileId: "user-1",
      type: "BOOKING_CONFIRMED",
      title: "Réservation confirmée",
      link: "/app/bookings",
    });
    expect(notificationCreate).toHaveBeenCalledWith({
      data: {
        recipientProfileId: "user-1",
        type: "BOOKING_CONFIRMED",
        title: "Réservation confirmée",
        body: undefined,
        link: "/app/bookings",
      },
    });
  });

  it("is best-effort: a write failure is logged, never thrown into the caller", async () => {
    notificationCreate.mockRejectedValueOnce(new Error("db down"));
    await expect(
      createInAppNotification({
        recipientProfileId: "user-1",
        type: "VERIFICATION_APPROVED",
        title: "Société vérifiée",
      })
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ event: "notification.create_failed" })
    );
  });
});
