import Link from "next/link";
import { RegisterForm } from "@/components/auth/register-form";
import { BrandLogo } from "@/components/brand/brand-logo";

export const metadata = { title: "Inscription — MakomSpace" };

export default function RegisterPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-8 text-foreground" aria-label="MakomSpace — accueil">
        <BrandLogo />
      </Link>
      <h1 className="text-xl font-semibold text-foreground">Créer un compte</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Choisissez le type de compte qui vous correspond.
      </p>
      <div className="mt-6">
        <RegisterForm />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-medium text-primary underline underline-offset-2">
          Connectez-vous
        </Link>
      </p>
    </div>
  );
}
