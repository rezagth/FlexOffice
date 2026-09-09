import { Button } from "@/components/ui/button";

/**
 * All three fields are wired to real filters on /search — city, date and
 * capacity are validated there (see src/app/search/page.tsx) exactly like
 * this form submits them: date as YYYY-MM-DD, capacity as a positive int.
 * Nothing here is disabled or a placeholder anymore.
 */
export function HeroSearch() {
  return (
    <form
      action="/search"
      className="flex w-full max-w-3xl flex-col gap-2 rounded-2xl border border-border bg-card p-2 shadow-lg sm:flex-row sm:items-center"
    >
      <label className="flex flex-1 flex-col gap-1 rounded-lg px-4 py-2 focus-within:ring-2 focus-within:ring-ring">
        <span className="text-xs font-medium text-muted-foreground">Où ?</span>
        <input
          type="text"
          name="city"
          placeholder="Ville (ex. Paris, Lyon…)"
          className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </label>
      <div className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />
      <label className="flex flex-1 flex-col gap-1 rounded-lg px-4 py-2 focus-within:ring-2 focus-within:ring-ring">
        <span className="text-xs font-medium text-muted-foreground">Quand ?</span>
        <input
          type="date"
          name="date"
          className="bg-transparent text-sm text-foreground [color-scheme:light] placeholder:text-muted-foreground focus:outline-none"
        />
      </label>
      <div className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />
      <label className="flex flex-1 flex-col gap-1 rounded-lg px-4 py-2 focus-within:ring-2 focus-within:ring-ring">
        <span className="text-xs font-medium text-muted-foreground">Capacité</span>
        <input
          type="number"
          name="capacity"
          min={1}
          placeholder="Nb. personnes"
          className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </label>
      <Button type="submit" size="lg" className="sm:ml-auto">
        Rechercher
      </Button>
    </form>
  );
}
