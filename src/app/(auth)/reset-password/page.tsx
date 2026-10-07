import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { ButtonLink } from "@/components/ui/button";
import { getAuthContext } from "@/server/auth/rbac";

export const metadata = { title: "Nouveau mot de passe — OfficeFlex" };
export const dynamic = "force-dynamic";

/**
 * Reached from a password-reset e-mail, through /auth/confirm, which opened
 * a recovery session. Without a session the link was never followed (or has
 * expired): say so and offer a new one rather than showing a form that can
 * only fail. The server decides whether the session may set a password
 * without the current one — this page only routes.
 */
export default async function ResetPasswordPage() {
  const ctx = await getAuthContext();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-8 text-lg font-semibold text-foreground">
        OfficeFlex
      </Link>
      <h1 className="text-xl font-semibold text-foreground">Nouveau mot de passe</h1>
      {ctx ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Choisissez le nouveau mot de passe de votre compte.
          </p>
          <div className="mt-6">
            <ResetPasswordForm />
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Ce lien n&apos;est plus valide ou a déjà été utilisé. Demandez un nouveau
            lien de réinitialisation.
          </p>
          <ButtonLink href="/forgot-password" className="mt-6 self-start">
            Demander un nouveau lien
          </ButtonLink>
        </>
      )}
    </div>
  );
}
