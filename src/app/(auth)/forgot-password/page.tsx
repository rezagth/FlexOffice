import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { BrandLogo } from "@/components/brand/brand-logo";

export const metadata = { title: "Mot de passe oublié — MakomSpace" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const { error } = await searchParams;
  // /auth/confirm sends a dead reset link here. Fixed text: the query
  // string selects whether to show it, never what it says.
  const notice =
    error === "link_invalid"
      ? "Ce lien de réinitialisation n'est plus valide : il a peut-être expiré ou déjà été utilisé. Demandez-en un nouveau ci-dessous."
      : undefined;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-8 text-foreground" aria-label="MakomSpace — accueil">
        <BrandLogo />
      </Link>
      <h1 className="text-xl font-semibold text-foreground">Mot de passe oublié</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Indiquez l&apos;adresse de votre compte : nous vous enverrons un lien pour
        choisir un nouveau mot de passe.
      </p>
      <div className="mt-6">
        <ForgotPasswordForm notice={notice} />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary underline underline-offset-2">
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
