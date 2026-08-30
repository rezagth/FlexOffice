import { getAuthContext } from "@/server/auth/rbac";
import { SpaceForm } from "@/components/dashboard/space-form";

export default async function NewSpacePage() {
  const ctx = await getAuthContext();
  if (!ctx?.organizationId) return null; // layout already redirects non-PARTNER; this guards the brief render race before that redirect completes

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Publier un espace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Votre espace est enregistré en brouillon. Soumettez-le ensuite pour
          validation : il sera visible publiquement une fois approuvé.
        </p>
      </div>
      <SpaceForm />
    </div>
  );
}
