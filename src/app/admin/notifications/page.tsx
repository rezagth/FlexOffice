import { requirePageAdmin } from "@/server/auth/page-guards";
import { listNotifications } from "@/server/domains/notifications/in-app";
import { EmptyState } from "@/components/dashboard/states";
import { NotificationList } from "@/components/dashboard/notification-list";

export const metadata = { title: "Notifications — Admin MakomSpace" };
export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const ctx = await requirePageAdmin();
  const notifications = await listNotifications(ctx.userId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>

      {notifications.length === 0 ? (
        <EmptyState
          title="Aucune notification pour l'instant"
          description="Les décisions de vérification et les événements de réservation que vous déclenchez apparaîtront ici."
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
