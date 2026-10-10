import { CalendarDays, MapPin, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The landing page search: city, date and capacity, submitted as-is to
 * /search, which validates them (lib/validation/search.ts).
 *
 * Layout (B-17 / UX-03): every field is `min-w-0` and its input `w-full`.
 * Before, the inputs kept the browser's intrinsic width (~20 characters),
 * the three fields overflowed the row and pushed the "Rechercher" button
 * 170 px out of the white card, navy on the navy hero — practically
 * invisible. The button is `shrink-0` and full width on mobile.
 */
export function HeroSearch() {
  return (
    <form
      action="/search"
      role="search"
      aria-label="Rechercher un espace"
      className="surface-light flex w-full max-w-4xl flex-col gap-2 rounded-2xl border border-border bg-card p-2 shadow-lg md:flex-row md:items-center"
    >
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-4 py-2 focus-within:ring-2 focus-within:ring-ring">
        <MapPin aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col text-left">
          <span className="text-xs font-medium text-muted-foreground">Où ?</span>
          <input
            type="text"
            name="city"
            autoComplete="address-level2"
            placeholder="Ville (ex. Paris, Lyon…)"
            className="w-full min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </span>
      </label>
      <div className="hidden h-8 w-px shrink-0 bg-border md:block" aria-hidden="true" />
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-4 py-2 focus-within:ring-2 focus-within:ring-ring">
        <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col text-left">
          <span className="text-xs font-medium text-muted-foreground">Quand ?</span>
          <input
            type="date"
            name="date"
            className="w-full min-w-0 bg-transparent text-sm text-foreground [color-scheme:light] focus:outline-none"
          />
        </span>
      </label>
      <div className="hidden h-8 w-px shrink-0 bg-border md:block" aria-hidden="true" />
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-4 py-2 focus-within:ring-2 focus-within:ring-ring md:max-w-44">
        <Users aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col text-left">
          <span className="text-xs font-medium text-muted-foreground">Capacité</span>
          <input
            type="number"
            name="capacity"
            min={1}
            inputMode="numeric"
            placeholder="Nb. personnes"
            className="w-full min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </span>
      </label>
      <Button type="submit" size="lg" className="w-full shrink-0 gap-2 md:w-auto">
        <Search aria-hidden="true" className="size-4" />
        Rechercher
      </Button>
    </form>
  );
}
