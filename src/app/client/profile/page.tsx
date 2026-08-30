import { getAuthContext } from "@/server/auth/rbac";
import { Card } from "@/components/ui/card";
import { GdprActions } from "@/components/dashboard/gdpr-actions";

export default async function ClientProfilePage() {
  const ctx = await getAuthContext();
  if (!ctx) return null; // layout already redirects unauthenticated users; this guards the brief render race before that redirect completes

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Profil</h1>

      <Card className="max-w-lg p-5">
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Nom</dt>
            <dd className="font-medium">{ctx.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium">{ctx.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Rôle</dt>
            <dd className="font-medium">Client</dd>
          </div>
        </dl>
      </Card>

      <Card className="max-w-lg p-5">
        <h2 className="mb-4 text-lg font-medium">Mes données personnelles</h2>
        <GdprActions />
      </Card>

      <p className="max-w-lg text-sm text-muted-foreground">
        La modification des informations de profil arrive dans une prochaine
        itération.
      </p>
    </div>
  );
}
