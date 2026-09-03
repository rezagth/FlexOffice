import { requirePageAuth } from "@/server/auth/page-guards";
import { ComingSoon } from "@/components/dashboard/states";

export const metadata = { title: "Messages — OfficeFlex" };

/**
 * Messaging placeholder.
 *
 * The route, the guard and the navigation entry exist so the unified space is
 * complete and so the conversation model has a home to land in. Reached in
 * either mode — a conversation about a booking concerns both sides of it, so
 * it is not a landlord feature or a tenant feature.
 *
 * Nothing is faked: no empty inbox implying messages could arrive, no
 * disabled compose box. `Conversation` and `Message` are a later phase.
 */
export default async function MessagesPage() {
  const ctx = await requirePageAuth({ redirectTo: "/app/messages" });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">
        {ctx.activeMode === "LANDLORD" ? "Messagerie" : "Messages"}
      </h1>
      <ComingSoon title="La messagerie arrive dans une prochaine itération" />
    </div>
  );
}
