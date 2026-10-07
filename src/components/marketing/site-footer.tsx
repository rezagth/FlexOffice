import Link from "next/link";
import { ManageCookiesButton } from "@/components/consent/manage-cookies-button";
import { BrandLogo } from "@/components/brand/brand-logo";
import { SITE_TAGLINE } from "@/lib/site";

const COMPANY_LINKS = [
  { href: "/search", label: "Rechercher un espace" },
  { href: "/proposer-un-espace", label: "Proposer un espace" },
  { href: "/contact", label: "Nous contacter" },
];

const LEGAL_LINKS = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/cgu", label: "CGU" },
  { href: "/cgv", label: "CGV" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/cookies", label: "Cookies" },
];

/**
 * No "À propos" / "Carrières" links: those pages don't exist in this repo
 * (only contact + the legal pages under (marketing) do), and a footer link
 * to a page that 404s is worse than a shorter column. Same reasoning for the
 * absence of a newsletter form and social icons — no email-capture backend
 * and no real social profiles exist yet; adding either here would be a
 * control that pretends to work. Both are flagged separately as follow-ups.
 */
export function SiteFooter() {
  return (
    <footer className="surface-dark bg-foreground text-background/80">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-12 sm:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Link href="/" className="text-background" aria-label="MakomSpace — accueil">
            <BrandLogo />
          </Link>
          <p className="mt-3 max-w-xs text-sm font-medium text-accent">{SITE_TAGLINE}</p>
          <p className="mt-2 max-w-xs text-sm">
            La plateforme de réservation d&apos;espaces professionnels flexibles à la
            demande.
          </p>
        </div>

        <nav aria-label="Plateforme">
          <p className="text-xs font-medium uppercase tracking-wide text-background/70">
            Plateforme
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {COMPANY_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-background">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Légal">
          <p className="text-xs font-medium uppercase tracking-wide text-background/70">
            Légal
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-background">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              {/* Withdrawing consent must be as easy as giving it (CNIL). */}
              <ManageCookiesButton className="text-left hover:text-background" />
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-background/10">
        <p className="mx-auto max-w-6xl px-6 py-6 text-xs">
          © {new Date().getFullYear()} MakomSpace. Tous droits réservés.
        </p>
      </div>
    </footer>
  );
}
