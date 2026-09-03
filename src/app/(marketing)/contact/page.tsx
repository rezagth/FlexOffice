import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ContactForm } from "@/components/marketing/contact-form";

export const metadata = {
  title: "Nous contacter — OfficeFlex",
  description: "Une question, un problème avec une réservation ? Écrivez-nous.",
};

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Nous contacter</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Une question sur une réservation, un litige, un problème de compte ?
            Décrivez-le ci-dessous, notre équipe vous répond directement.
          </p>
        </div>
        <ContactForm />
      </main>
      <SiteFooter />
    </div>
  );
}
