"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SPACE_TYPE_LABELS } from "@/lib/format";
import { COMMON_TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { SpacePhotos } from "@/components/dashboard/space-photos";

const WEEKDAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export type OpeningHourRow = { weekday: number; enabled: boolean; opensAt: string; closesAt: string };

export type SpaceFormValues = {
  name: string;
  type: string;
  description: string;
  address: string;
  city: string;
  postalCode: string;
  capacity: string;
  amenities: string;
  halfDayPrice: string;
  dayPrice: string;
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
  amenities: "",
  halfDayPrice: "",
  dayPrice: "",
  accessInstructions: "",
  timezone: DEFAULT_TIMEZONE,
};

const DEFAULT_HOURS: OpeningHourRow[] = WEEKDAY_LABELS.map((_, weekday) => ({
  weekday,
  enabled: weekday >= 1 && weekday <= 5,
  opensAt: "09:00",
  closesAt: "18:00",
}));

/** Prices are entered in euros and converted to integer cents here —
 * amounts never travel or get stored as floats. */
function toCents(euros: string): number {
  return Math.round(Number(euros.replace(",", ".")) * 100);
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function SpaceForm({
  spaceId,
  initialValues,
  initialHours,
  initialPhotos = [],
}: {
  spaceId?: string;
  initialValues?: SpaceFormValues;
  initialHours?: OpeningHourRow[];
  initialPhotos?: string[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<SpaceFormValues>(initialValues ?? EMPTY);
  const [hours, setHours] = useState<OpeningHourRow[]>(initialHours ?? DEFAULT_HOURS);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof SpaceFormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const setHour = (weekday: number, patch: Partial<OpeningHourRow>) =>
    setHours((prev) => prev.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)));

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
      amenities: splitList(values.amenities),
      halfDayPriceCents: toCents(values.halfDayPrice),
      dayPriceCents: toCents(values.dayPrice),
      ...(values.accessInstructions ? { accessInstructions: values.accessInstructions } : {}),
      ...(values.timezone ? { timezone: values.timezone } : {}),
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
          hours
            .filter((h) => h.enabled)
            .map((h) => ({ weekday: h.weekday, opensAt: h.opensAt, closesAt: h.closesAt }))
        ),
      });
      if (!hoursResponse.ok) {
        const hoursBody = await hoursResponse.json();
        setError(hoursBody?.error?.message ?? "Les horaires n'ont pas pu être enregistrés.");
        return;
      }

      router.push("/partner/spaces");
      router.refresh();
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
        <h2 className="text-lg font-medium">Équipements et photos</h2>
        <Field label="Équipements" htmlFor="amenities" hint="Un par ligne, ou séparés par des virgules.">
          <Textarea
            id="amenities"
            value={values.amenities}
            onChange={(e) => set("amenities")(e.target.value)}
          />
        </Field>
        {spaceId ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Photos</span>
            <SpacePhotos spaceId={spaceId} initialPhotos={initialPhotos} />
          </div>
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
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Horaires d&apos;ouverture</h2>
        <p className="text-sm text-muted-foreground">
          Les créneaux réservables sont calculés à partir de ces horaires : matin
          (ouverture → 13h), après-midi (13h → fermeture), ou journée complète.
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
        <div className="flex flex-col gap-2">
          {hours.map((hour) => (
            <div key={hour.weekday} className="flex flex-wrap items-center gap-3">
              <label className="flex w-32 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hour.enabled}
                  onChange={(e) => setHour(hour.weekday, { enabled: e.target.checked })}
                />
                {WEEKDAY_LABELS[hour.weekday]}
              </label>
              <Input
                type="time"
                aria-label={`Ouverture ${WEEKDAY_LABELS[hour.weekday]}`}
                className="w-32"
                disabled={!hour.enabled}
                value={hour.opensAt}
                onChange={(e) => setHour(hour.weekday, { opensAt: e.target.value })}
              />
              <span className="text-sm text-muted-foreground">→</span>
              <Input
                type="time"
                aria-label={`Fermeture ${WEEKDAY_LABELS[hour.weekday]}`}
                className="w-32"
                disabled={!hour.enabled}
                value={hour.closesAt}
                onChange={(e) => setHour(hour.weekday, { closesAt: e.target.value })}
              />
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
