"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SPACE_TYPE_LABELS } from "@/lib/format";

const AUTO_SWITCH_TO_MEETING_ROOM_AT = 6;

/**
 * PRD V1.1, R3-R6: "Capacité minimale" only makes sense once a type is
 * chosen, so it stays hidden until then (café/poste was never a space type —
 * it was only an illustration in the landing page's comparison block, R1/R2
 * — so this filter has exactly the 3 real SpaceType values).
 *
 * Raising the capacity to 6+ while "Bureau" is selected switches the type to
 * "Salle de réunion", with a visible notice — a default suggestion, not a
 * lock: picking "Bureau" again from the dropdown is never fought back,
 * whatever the capacity. "Salle de formation" has no such behavior; it is
 * never switched into or out of automatically.
 *
 * Still a classic GET-submitted form otherwise — no submit handler here, the
 * select and the number input are native fields the surrounding `<form>` in
 * /search collects on submit (same pattern as search-geolocation.tsx). The
 * capacity input only exists in the DOM once a type is chosen, so it is
 * simply absent from the submission otherwise — consistent with "no type
 * means no capacity filter either".
 */
export function SpaceTypeFilter({
  defaultType,
  defaultCapacity,
}: {
  defaultType?: string;
  defaultCapacity?: number;
}) {
  const [type, setType] = useState(defaultType ?? "");
  const [capacity, setCapacity] = useState(defaultCapacity != null ? String(defaultCapacity) : "");
  const [autoSwitched, setAutoSwitched] = useState(false);

  function onTypeChange(value: string) {
    setType(value);
    setAutoSwitched(false);
  }

  function onCapacityChange(raw: string) {
    setCapacity(raw);
    const value = Number(raw);
    const crossesThreshold = raw !== "" && Number.isFinite(value) && value >= AUTO_SWITCH_TO_MEETING_ROOM_AT;
    if (type === "DESK" && crossesThreshold) {
      setType("MEETING_ROOM");
      setAutoSwitched(true);
    }
  }

  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="search-type">Type d&apos;espace</Label>
        <Select id="search-type" name="type" value={type} onChange={(e) => onTypeChange(e.target.value)}>
          <option value="">Tous les types</option>
          {Object.entries(SPACE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {type && (
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
          {autoSwitched && (
            <p role="status" className="text-xs text-muted-foreground">
              Basculé sur « Salle de réunion » pour {capacity || "ce nombre de"} personnes.{" "}
              <button
                type="button"
                className="font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => onTypeChange("DESK")}
              >
                Revenir à Bureau
              </button>
            </p>
          )}
        </div>
      )}
    </>
  );
}
