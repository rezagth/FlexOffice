"use client";

import { useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SEARCH_TYPE_BUCKETS, type SearchTypeBucket } from "@/lib/validation/search";

const BUCKET_LABELS: Record<SearchTypeBucket, string> = {
  CAFE_SPOT: "Café / poste",
  DESK: "Bureau",
  // Covers espaces de formation too — the filter never offers a separate box
  // for them (PRD V1.1, R3).
  MEETING_ROOM: "Salles de réunion",
};

const UNCHECK_CAFE_AT = 3;
const PRIORITIZE_MEETING_ROOMS_AT = 6;

/**
 * The search form's "Capacité minimale" input and its 3 type checkboxes,
 * together: PRD V1.1 R5/R6 react to one from the other (entering 3+ people
 * unchecks "Café / poste"; 6+ checks "Salles de réunion"), which only a
 * client component sharing state between the two fields can do.
 *
 * A default, not a lock (R6): the visitor can always recheck a box the
 * threshold unchecked. Once they touch a box by hand, the threshold stops
 * touching it back for the rest of this visit to the page.
 *
 * Still a classic GET-submitted form otherwise — no submit handler here, the
 * checkboxes and the number input are native fields with `name`s the
 * surrounding `<form>` in /search collects on submit (same pattern as
 * search-geolocation.tsx).
 */
export function SpaceTypeFilter({
  defaultCapacity,
  defaultTypes,
}: {
  defaultCapacity?: number;
  /** Checked buckets from the URL; empty means every box starts checked. */
  defaultTypes: string[];
}) {
  const [capacity, setCapacity] = useState(defaultCapacity != null ? String(defaultCapacity) : "");
  const [checked, setChecked] = useState<ReadonlySet<SearchTypeBucket>>(
    () => new Set(defaultTypes.length ? (defaultTypes as SearchTypeBucket[]) : SEARCH_TYPE_BUCKETS)
  );
  // Buckets the visitor toggled by hand: a threshold never overrides those.
  const touched = useRef<Set<SearchTypeBucket>>(new Set());

  function toggle(bucket: SearchTypeBucket) {
    touched.current.add(bucket);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  }

  function onCapacityChange(raw: string) {
    setCapacity(raw);
    const value = Number(raw);
    if (!raw || !Number.isFinite(value)) return;

    setChecked((prev) => {
      const next = new Set(prev);
      if (value >= UNCHECK_CAFE_AT && !touched.current.has("CAFE_SPOT")) {
        next.delete("CAFE_SPOT");
      }
      if (value >= PRIORITIZE_MEETING_ROOMS_AT && !touched.current.has("MEETING_ROOM")) {
        next.add("MEETING_ROOM");
      }
      return next;
    });
  }

  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="search-capacity">Capacité minimale</Label>
        <Input
          id="search-capacity"
          type="number"
          name="capacity"
          min={1}
          inputMode="numeric"
          value={capacity}
          onChange={(e) => onCapacityChange(e.target.value)}
          placeholder="Ex. 10"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-foreground">Type d&apos;espace</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          {SEARCH_TYPE_BUCKETS.map((bucket) => (
            <div key={bucket} className="flex items-center gap-2">
              <Checkbox
                id={`type-${bucket}`}
                name="type"
                value={bucket}
                checked={checked.has(bucket)}
                onCheckedChange={() => toggle(bucket)}
              />
              <Label htmlFor={`type-${bucket}`} className="font-normal">
                {BUCKET_LABELS[bucket]}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>
    </>
  );
}
