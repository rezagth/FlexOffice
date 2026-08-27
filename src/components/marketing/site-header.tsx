import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-foreground">
          OfficeFlex
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/search"
            className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block"
          >
            Rechercher un espace
          </Link>
          <ButtonLink href="/login" variant="ghost" size="sm">
            Connexion
          </ButtonLink>
          <ButtonLink href="/register" variant="primary" size="sm">
            Inscription
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
