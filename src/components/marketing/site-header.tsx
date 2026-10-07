import Link from "next/link";
import { Bell, HelpCircle, Search } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { getAuthContext } from "@/server/auth/rbac";
import { MobileMenu, type HeaderLink } from "./mobile-menu";

/**
 * The public header, shared by every public page.
 *
 * - Starts with the skip link to `#contenu` (UX-19): every public page
 *   renders `<main id="contenu">`.
 * - An anonymous visitor gets public search, "Proposer un espace" (UX-13 —
 *   the landlord half of the marketplace had no entry point for a visitor)
 *   and sign-in/sign-up; never links that imply bookings or favorites they
 *   don't have. A signed-in visitor gets the real `/app` destinations.
 * - Below `sm`, the links move into MobileMenu (UX-14), with a city search;
 *   a search icon stays visible in the bar.
 *
 * The bell points at /app/messages (no notifications feed exists; booking
 * messages are the closest real destination). The help icon links to
 * /contact.
 */
export async function SiteHeader() {
  const ctx = await getAuthContext();

  const links: HeaderLink[] = [{ href: "/search", label: "Rechercher un espace" }];
  if (ctx) {
    links.push(
      {
        href: ctx.isLandlord ? "/app/landlord/spaces/new" : "/app/become-landlord",
        label: "Publier un espace",
      },
      { href: "/app/favorites", label: "Favoris" },
      { href: "/app/bookings", label: "Réservations" }
    );
  } else {
    links.push({ href: "/proposer-un-espace", label: "Proposer un espace" });
  }
  const account: HeaderLink[] = ctx
    ? [{ href: "/app/account", label: "Profil" }]
    : [
        { href: "/login", label: "Connexion" },
        { href: "/register", label: "Inscription" },
      ];
  const mobileLinks: HeaderLink[] = [...links, { href: "/contact", label: "Aide et contact" }];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="text-lg font-semibold text-foreground">
          OfficeFlex
        </Link>

        <nav aria-label="Navigation principale" className="hidden items-center gap-6 sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <Link
            href="/search"
            aria-label="Rechercher un espace"
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
          >
            <Search aria-hidden="true" className="size-5" />
          </Link>
          {ctx && (
            <Link
              href="/app/messages"
              aria-label="Messages"
              className="hidden rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:block"
            >
              <Bell aria-hidden="true" className="size-5" />
            </Link>
          )}
          <Link
            href="/contact"
            aria-label="Aide et contact"
            className="hidden rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:block"
          >
            <HelpCircle aria-hidden="true" className="size-5" />
          </Link>
          <div className="hidden items-center gap-1 sm:flex">
            {ctx ? (
              <ButtonLink href="/app/account" size="sm" className="ml-2">
                Profil
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/login" variant="ghost" size="sm">
                  Connexion
                </ButtonLink>
                <ButtonLink href="/register" variant="primary" size="sm">
                  Inscription
                </ButtonLink>
              </>
            )}
          </div>
          <MobileMenu links={mobileLinks} account={account} />
        </div>
      </div>
    </header>
  );
}
