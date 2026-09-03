"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SPACE_AMENITY_LABELS, SPACE_TYPE_LABELS } from "@/lib/format";
import { COMMON_TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { SpacePhotoManager } from "@/components/dashboard/space-photo-manager";

const WEEKDAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const AMENITY_VALUES = Object.keys(SPACE_AMENITY_LABELS);

/** One weekday's schedule as several independent slots — "Fermé" is simply
 * an empty `slots` array, not a separate flag, since Phase 5 stores each
 * slot as its own row rather than one opensAt/closesAt span per day. */
export type WeekdayHours = {
  weekday: number;
  slots: { opensAt: string; closesAt: string }[];
};

export type SpaceFormValues = {
  name: string;
  type: string;
  description: string;
  address: string;
  city: string;
  postalCode: string;
  capacity: string;
  amenities: string[];
  halfDayPrice: string;
  dayPrice: string;
  /** Empty string means no discount — kept a string like the other price
   * fields so the input can be blank rather than defaulting to "0". */
  discountPercent: string;
  accessInstructions: string;
  timezone: string;
};

const EMPTY: SpaceFormValues = {
  name: "",
  type: "MEETING_ROOM",
  description: "",
  address: "",
  city: "",
  postalCode: "",
  capacity: "4",
  amenities: [],
  halfDayPrice: "",
  dayPrice: "",
  discountPercent: "",
  accessInstructions: "",
  timezone: DEFAULT_TIMEZONE,
};

const DEFAULT_HOURS: WeekdayHours[] = WEEKDAY_LABELS.map((_, weekday) => ({
  weekday,
  slots: weekday >= 1 && weekday <= 5 ? [{ opensAt: "09:00", closesAt: "18:00" }] : [],
}));

/** Prices are entered in euros and converted to integer cents here —
 * amounts never travel or get stored as floats. */
function toCents(euros: string): number {
  return Math.round(Number(euros.replace(",", ".")) * 100);
}

export function SpaceForm({
  spaceId,
  initialValues,
  initialHours,
  initialPhotos = [],
  properties,
  initialPropertyId,
}: {
  spaceId?: string;
  initialValues?: SpaceFormValues;
  initialHours?: WeekdayHours[];
  initialPhotos?: { id: string; url: string; isPrimary: boolean; position: number }[];
  /** The property picker — only meaningful (and only rendered) when
   * creating: which building this space belongs to is not something a
   * later edit changes in this phase. */
  properties?: { id: string; label: string }[];
  initialPropertyId?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<SpaceFormValues>(initialValues ?? EMPTY);
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? properties?.[0]?.id ?? "");
  const [hours, setHours] = useState<WeekdayHours[]>(initialHours ?? DEFAULT_HOURS);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof SpaceFormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function toggleAmenity(value: string) {
    setValues((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(value)
        ? prev.amenities.filter((a) => a !== value)
        : [...prev.amenities, value],
    }));
  }

  function addSlot(weekday: number) {
    setHours((prev) =>
      prev.map((d) =>
        d.weekday === weekday ? { ...d, slots: [...d.slots, { opensAt: "09:00", closesAt: "18:00" }] } : d
      )
    );
  }

  function removeSlot(weekday: number, index: number) {
    setHours((prev) =>
      prev.map((d) =>
        d.weekday === weekday ? { ...d, slots: d.slots.filter((_, i) => i !== index) } : d
      )
    );
  }

  function updateSlot(weekday: number, index: number, patch: Partial<{ opensAt: string; closesAt: string }>) {
    setHours((prev) =>
      prev.map((d) =>
        d.weekday === weekday
          ? { ...d, slots: d.slots.map((s, i) => (i === index ? { ...s, ...patch } : s)) }
          : d
      )
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      name: values.name,
      type: values.type,
      description: values.description,
      address: values.address,
      city: values.city,
      postalCode: values.postalCode,
      capacity: Number(values.capacity),
      amenities: values.amenities,
      halfDayPriceCents: toCents(values.halfDayPrice),
      dayPriceCents: toCents(values.dayPrice),
      discountPercent: values.discountPercent === "" ? null : Number(values.discountPercent),
      ...(values.accessInstructions ? { accessInstructions: values.accessInstructions } : {}),
      ...(values.timezone ? { timezone: values.timezone } : {}),
      // Only sent on creation — see the `properties` prop doc comment.
      ...(spaceId ? {} : { propertyId }),
    };

    try {
      const response = await fetch(spaceId ? `/api/partner/spaces/${spaceId}` : "/api/partner/spaces", {
        method: spaceId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "L'enregistrement a échoué.");
        return;
      }

      const savedId: string = spaceId ?? body.space.id;
      const hoursResponse = await fetch(`/api/partner/spaces/${savedId}/opening-hours`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          hours.flatMap((d) =>
            d.slots.map((s) => ({ weekday: d.weekday, opensAt: s.opensAt, closesAt: s.closesAt }))
          )
        ),
      });
      if (!hoursResponse.ok) {
        const hoursBody = await hoursResponse.json();
        setError(hoursBody?.error?.message ?? "Les horaires n'ont pas pu être enregistrés.");
        return;
      }

      if (spaceId) {
        router.refresh();
      } else {
        router.push(`/app/landlord/properties/${propertyId}/spaces/${savedId}`);
        router.refresh();
      }
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <Card role="alert" className="border-danger p-4 text-sm text-danger">
          {error}
        </Card>
      )}

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Informations</h2>
        {!spaceId && (
          <Field
            label="Bien"
            htmlFor="propertyId"
            hint="L'immeuble ou le local dont cet espace fait partie"
          >
            <Select
              id="propertyId"
              required
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
            >
              {(properties ?? []).length === 0 && <option value="">Aucun bien disponible</option>}
              {(properties ?? []).map((property) => (
                <option key={property.id} value={property.id}>
                  {property.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Nom de l'espace" htmlFor="name">
          <Input
            id="name"
            required
            maxLength={150}
            value={values.name}
            onChange={(e) => set("name")(e.target.value)}
          />
        </Field>
        <Field label="Type" htmlFor="type">
          <Select id="type" value={values.type} onChange={(e) => set("type")(e.target.value)}>
            {Object.entries(SPACE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" htmlFor="description">
          <Textarea
            id="description"
            required
            maxLength={4000}
            value={values.description}
            onChange={(e) => set("description")(e.target.value)}
          />
        </Field>
        <Field label="Capacité (personnes)" htmlFor="capacity">
          <Input
            id="capacity"
            type="number"
            min={1}
            max={1000}
            required
            value={values.capacity}
            onChange={(e) => set("capacity")(e.target.value)}
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Adresse</h2>
        <Field label="Adresse" htmlFor="address">
          <Input
            id="address"
            required
            value={values.address}
            onChange={(e) => set("address")(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ville" htmlFor="city">
            <Input id="city" required value={values.city} onChange={(e) => set("city")(e.target.value)} />
          </Field>
          <Field label="Code postal" htmlFor="postalCode">
            <Input
              id="postalCode"
              required
              inputMode="numeric"
              pattern="\d{5}"
              value={values.postalCode}
              onChange={(e) => set("postalCode")(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Instructions d'accès"
          htmlFor="accessInstructions"
          hint="Transmises au client uniquement après confirmation de sa réservation."
        >
          <Textarea
            id="accessInstructions"
            maxLength={2000}
            value={values.accessInstructions}
            onChange={(e) => set("accessInstructions")(e.target.value)}
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Équipements</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AMENITY_VALUES.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={values.amenities.includes(value)}
                onChange={() => toggleAmenity(value)}
              />
              {SPACE_AMENITY_LABELS[value]}
            </label>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Photos</h2>
        {spaceId ? (
          <SpacePhotoManager propertyId={propertyId} spaceId={spaceId} initialPhotos={initialPhotos} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Les photos s&apos;ajoutent une fois le brouillon créé : enregistrez
            d&apos;abord, vous pourrez les envoyer depuis l&apos;écran de modification.
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Tarifs</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Demi-journée (€)" htmlFor="halfDayPrice">
            <Input
              id="halfDayPrice"
              inputMode="decimal"
              required
              value={values.halfDayPrice}
              onChange={(e) => set("halfDayPrice")(e.target.value)}
            />
          </Field>
          <Field label="Journée (€)" htmlFor="dayPrice">
            <Input
              id="dayPrice"
              inputMode="decimal"
              required
              value={values.dayPrice}
              onChange={(e) => set("dayPrice")(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Remise (%)"
          htmlFor="discountPercent"
          hint="Optionnel. S'applique à la demi-journée et à la journée. Laisser vide pour aucune remise."
        >
          <Input
            id="discountPercent"
            type="number"
            min={0}
            max={100}
            value={values.discountPercent}
            onChange={(e) => set("discountPercent")(e.target.value)}
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Horaires d&apos;ouverture</h2>
        <p className="text-sm text-muted-foreground">
          Plusieurs créneaux par jour sont possibles (matin et après-midi,
          par exemple). Un jour sans créneau est un jour fermé.
        </p>
        <Field
          label="Fuseau horaire"
          htmlFor="timezone"
          hint="Les horaires ci-dessous sont lus dans ce fuseau."
        >
          <Select
            id="timezone"
            value={values.timezone}
            onChange={(e) => set("timezone")(e.target.value)}
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-col gap-4">
          {hours.map((day) => (
            <div key={day.weekday} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {WEEKDAY_LABELS[day.weekday]}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => addSlot(day.weekday)}>
                  + Ajouter un créneau
                </Button>
              </div>
              {day.slots.length === 0 ? (
                <p className="text-xs text-muted-foreground">Fermé</p>
              ) : (
                day.slots.map((slot, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-3">
                    <Input
                      type="time"
                      aria-label={`Ouverture ${WEEKDAY_LABELS[day.weekday]} créneau ${index + 1}`}
                      className="w-32"
                      value={slot.opensAt}
                      onChange={(e) => updateSlot(day.weekday, index, { opensAt: e.target.value })}
                    />
                    <span className="text-sm text-muted-foreground">→</span>
                    <Input
                      type="time"
                      aria-label={`Fermeture ${WEEKDAY_LABELS[day.weekday]} créneau ${index + 1}`}
                      className="w-32"
                      value={slot.closesAt}
                      onChange={(e) => updateSlot(day.weekday, index, { closesAt: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSlot(day.weekday, index)}
                    >
                      Retirer
                    </Button>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : spaceId ? "Enregistrer" : "Créer le brouillon"}
        </Button>
      </div>
    </form>
  );
}
