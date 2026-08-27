import { Button } from "@/components/ui/button";

// Only "ville" is wired to real filtering this iteration (see
// listPublishedSpaces). Date and capacity are shown — matching the
// Airbnb-style three-segment search bar the brief asks for — but marked
// disabled rather than silently accepted and ignored.
export function HeroSearch() {
  return (
    <form
      action="/search"
      className="flex w-full max-w-3xl flex-col gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm sm:flex-row sm:items-center"
    >
      <label className="flex flex-1 flex-col gap-1 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">Localisation</span>
        <input
          type="text"
          name="city"
          placeholder="Ville (ex. Paris, Lyon…)"
          className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </label>
      <div className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />
      <label className="flex flex-1 flex-col gap-1 px-4 py-2 opacity-60">
        <span className="text-xs font-medium text-muted-foreground">Date</span>
        <input
          type="text"
          disabled
          placeholder="Bientôt disponible"
          className="bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </label>
      <div className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />
      <label className="flex flex-1 flex-col gap-1 px-4 py-2 opacity-60">
        <span className="text-xs font-medium text-muted-foreground">Personnes</span>
        <input
          type="text"
          disabled
          placeholder="Bientôt disponible"
          className="bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </label>
      <Button type="submit" size="lg" className="sm:ml-auto">
        Rechercher
      </Button>
    </form>
  );
}
