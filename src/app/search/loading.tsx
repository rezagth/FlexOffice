import Link from "next/link";
import { LoadingState } from "@/components/dashboard/states";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while /search renders (UX-23): the same frame as the page — header
 * bar, filters, a grid of result cards — so the layout does not jump when
 * the results arrive. The header here is a static stand-in: the real one
 * reads the session, which is exactly what we are waiting for.
 */
export default function SearchLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-3 sm:px-6 sm:py-4">
          <Link href="/" className="text-lg font-semibold text-foreground">
            OfficeFlex
          </Link>
        </div>
      </div>
      <main id="contenu" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-foreground">Rechercher un espace</h1>
          <LoadingState label="Recherche des espaces disponibles…" compact />
        </div>
        <Skeleton className="h-56 rounded-2xl" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-0">
              <Skeleton className="h-40 rounded-b-none rounded-t-2xl" />
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
