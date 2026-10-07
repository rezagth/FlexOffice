import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page introuvable — MakomSpace",
  robots: { index: false, follow: false },
};

/**
 * French 404 in the site's frame (B-19 / UX-09): every unmatched URL, and
 * every `notFound()` — an unknown or unpublished space slug included. It
 * replaced Next.js's default English page.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main
        id="contenu"
        className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 px-6 py-20 text-center"
      >
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-full bg-muted text-foreground"
        >
          <Compass className="size-6" />
        </span>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Erreur 404
        </p>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          Cette page est introuvable
        </h1>
        <p className="text-muted-foreground">
          Le lien est peut-être erroné, ou l&apos;espace que vous cherchez n&apos;est plus
          publié.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink href="/">Retour à l&apos;accueil</ButtonLink>
          <ButtonLink href="/search" variant="outline">
            Rechercher un espace
          </ButtonLink>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
