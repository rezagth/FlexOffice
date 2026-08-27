import { getAuthContext } from "@/server/auth/rbac";
import { Card } from "@/components/ui/card";

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

      <p className="max-w-lg text-sm text-muted-foreground">
        La modification du profil et la gestion RGPD (export, suppression) arrivent
        dans une prochaine itération.
      </p>
    </div>
  );
}
