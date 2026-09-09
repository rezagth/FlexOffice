import Link from "next/link";
import { Bell, HelpCircle } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { getAuthContext } from "@/server/auth/rbac";

/**
 * The public marketing header. Renders differently for a signed-in visitor:
 * an anonymous visitor gets exactly one functional link (public search) plus
 * sign-in/sign-up — never links that imply bookings or favorites they don't
 * have. A signed-in visitor gets the real `/app` destinations instead.
 *
 * The bell icon points at /app/messages rather than a real notifications
 * feed — there is no notifications feature in this repo, but booking
 * messages are the closest real destination, so the icon isn't a dead
 * control. The help icon links to the real /contact page.
 */
export async function SiteHeader() {
  const ctx = await getAuthContext();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-foreground">
          OfficeFlex
        </Link>

        <nav aria-label="Navigation principale" className="hidden items-center gap-6 sm:flex">
          <Link
            href="/search"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Rechercher un espace
          </Link>
          {ctx && (
            <>
              <Link
                href={ctx.isLandlord ? "/app/landlord/spaces/new" : "/app/become-landlord"}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Publier un espace
              </Link>
              <Link
                href="/app/favorites"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Favoris
              </Link>
              <Link
                href="/app/bookings"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Réservations
              </Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-1">
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
            aria-label="Aide"
            className="hidden rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:block"
          >
            <HelpCircle aria-hidden="true" className="size-5" />
          </Link>
          {ctx ? (
            <ButtonLink
              href="/app/account"
              size="sm"
              className="ml-2 bg-foreground text-background hover:bg-foreground/90"
            >
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
      </div>
    </header>
  );
}
