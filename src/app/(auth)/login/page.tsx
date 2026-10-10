import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { safeRedirectPath } from "@/lib/validation/redirect";
import { BrandLogo } from "@/components/brand/brand-logo";

export const metadata = { title: "Connexion — MakomSpace" };

// Messages for the `error` codes /auth/confirm redirects here with. A fixed
// table: the query string only selects a message, it never supplies text.
const NOTICES: Record<string, string> = {
  link_invalid:
    "Ce lien n'est plus valide : il a peut-être expiré ou déjà été utilisé. Connectez-vous, ou demandez un nouveau lien.",
  auth_unavailable: "La connexion n'est pas disponible pour le moment. Réessayez plus tard.",
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const { redirectTo, error } = await searchParams;
  const notice = typeof error === "string" && Object.hasOwn(NOTICES, error) ? NOTICES[error] : undefined;
  // Validated here as well as in the form: `redirectTo` is attacker-supplied,
  // and a link like /login?redirectTo=https://evil.example would otherwise
  // hand a freshly authenticated user to another origin.
  const redirect = safeRedirectPath(redirectTo);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-8 text-foreground" aria-label="MakomSpace — accueil">
        <BrandLogo />
      </Link>
      <h1 className="text-xl font-semibold text-foreground">Connexion</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Accédez à votre espace client ou entreprise.
      </p>
      <div className="mt-6">
        <LoginForm redirectTo={redirect} notice={notice} />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Pas encore de compte ?{" "}
        <Link href="/register" className="font-medium text-primary underline underline-offset-2">
          Inscrivez-vous
        </Link>
      </p>
    </div>
  );
}
