import { requirePageAuth } from "@/server/auth/page-guards";
import { listNotifications } from "@/server/domains/notifications/in-app";
import { EmptyState } from "@/components/dashboard/states";
import { NotificationList } from "@/components/dashboard/notification-list";

export const metadata = { title: "Notifications — MakomSpace" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const ctx = await requirePageAuth();
  const notifications = await listNotifications(ctx.userId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>

      {notifications.length === 0 ? (
        <EmptyState
          title="Aucune notification pour l'instant"
          description="Vous serez prévenu ici dès qu'une réservation ou un dossier de vérification évolue."
        />
      ) : (
        <NotificationList
          notifications={notifications.map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            link: n.link,
            read: n.readAt !== null,
            createdAt: n.createdAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
