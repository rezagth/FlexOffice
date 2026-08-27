import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Connexion — OfficeFlex" };

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const { redirectTo } = await searchParams;
  const redirect = typeof redirectTo === "string" ? redirectTo : undefined;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-8 text-lg font-semibold text-foreground">
        OfficeFlex
      </Link>
      <h1 className="text-xl font-semibold text-foreground">Connexion</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Accédez à votre espace client ou entreprise.
      </p>
      <div className="mt-6">
        <LoginForm redirectTo={redirect} />
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
