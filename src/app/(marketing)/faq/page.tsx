import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PageHero } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { pageMetadata } from "@/lib/site";
import { jsonLd } from "@/lib/json-ld";
import { FAQ, faqStructuredData } from "./faq-content";

export const metadata: Metadata = pageMetadata({
  title: "Questions fréquentes — MakomSpace",
  description:
    "Réservation, paiement, annulation, factures, avis, publication d'un espace, versements : les réponses aux questions les plus fréquentes sur MakomSpace.",
  path: "/faq",
});

/**
 * FAQ — native <details>/<summary>: keyboard and screen-reader support for
 * free, works without JavaScript, and every answer is in the HTML (search
 * engines, Ctrl+F). Content and figures in ./faq-content.ts.
 */
export default function FaqPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(faqStructuredData()) }}
      />
      <SiteHeader />
      <main id="contenu" className="flex-1">
        <PageHero eyebrow="Aide" title="Questions fréquentes">
          <p className="max-w-2xl text-base text-background/85 sm:text-lg">
            Tout ce qu&apos;il faut savoir pour réserver un espace ou proposer le vôtre.
          </p>
        </PageHero>

        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6">
          <nav aria-label="Rubriques" className="flex flex-wrap justify-center gap-2">
            {FAQ.map((category) => (
              <a
                key={category.id}
                href={`#${category.id}`}
                className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-foreground hover:bg-muted"
              >
                {category.title}
              </a>
            ))}
          </nav>

          {FAQ.map((category) => (
            <section key={category.id} id={category.id} aria-labelledby={`${category.id}-title`} className="scroll-mt-24">
              <h2 id={`${category.id}-title`} className="text-xl font-semibold text-foreground">
                {category.title}
              </h2>
              <div className="mt-4 flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
                {category.items.map((item) => (
                  <details key={item.id} id={`${category.id}-${item.id}`} className="group px-5 py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-medium text-foreground [&::-webkit-details-marker]:hidden">
                      {item.question}
                      <ChevronDown
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
                      {item.answer.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                      {item.links && (
                        <p className="flex flex-wrap gap-x-4 gap-y-1">
                          {item.links.map((link) => (
                            <Link key={link.href} href={link.href} className="font-medium text-primary underline-offset-4 hover:underline">
                              {link.label} →
                            </Link>
                          ))}
                        </p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}

          <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted px-6 py-8 text-center">
            <h2 className="text-lg font-semibold text-foreground">Vous ne trouvez pas votre réponse ?</h2>
            <p className="text-sm text-muted-foreground">Écrivez-nous, nous vous répondons par e-mail.</p>
            <ButtonLink href="/contact">Nous contacter</ButtonLink>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
