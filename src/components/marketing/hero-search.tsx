import { CalendarDays, MapPin, Search, Users } from "lucide-react";
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
      <label className="flex flex-1 items-center gap-2 rounded-lg px-4 py-2 focus-within:ring-2 focus-within:ring-ring">
        <MapPin aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex flex-col text-left">
          <span className="text-xs font-medium text-muted-foreground">Où ?</span>
          <input
            type="text"
            name="city"
            placeholder="Ville (ex. Paris, Lyon…)"
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </span>
      </label>
      <div className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />
      <label className="flex flex-1 items-center gap-2 rounded-lg px-4 py-2 focus-within:ring-2 focus-within:ring-ring">
        <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex flex-col text-left">
          <span className="text-xs font-medium text-muted-foreground">Quand ?</span>
          <input
            type="date"
            name="date"
            className="bg-transparent text-sm text-foreground [color-scheme:light] placeholder:text-muted-foreground focus:outline-none"
          />
        </span>
      </label>
      <div className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />
      <label className="flex flex-1 items-center gap-2 rounded-lg px-4 py-2 focus-within:ring-2 focus-within:ring-ring">
        <Users aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex flex-col text-left">
          <span className="text-xs font-medium text-muted-foreground">Capacité</span>
          <input
            type="number"
            name="capacity"
            min={1}
            placeholder="Nb. personnes"
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </span>
      </label>
      <Button
        type="submit"
        size="lg"
        className="gap-2 bg-foreground text-background hover:bg-foreground/90 sm:ml-auto"
      >
        <Search aria-hidden="true" className="size-4" />
        Rechercher
      </Button>
    </form>
  );
}
