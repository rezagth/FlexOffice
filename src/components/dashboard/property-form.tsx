"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PROPERTY_TYPE_LABELS } from "@/lib/format";

/**
 * "Ajouter un bien" — minimal on purpose (Étape 18): name, type, address.
 * Coordinates are collectible later, never asked for by hand here — no
 * geocoding provider is wired up yet (Phase 4 scope).
 */
export function PropertyForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [propertyType, setPropertyType] = useState("OFFICE");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const response = await fetch("/api/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, propertyType, addressLine1, city, postalCode }),
    });

    if (!response.ok) {
      setPending(false);
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "L'ajout du bien a échoué.");
      return;
    }

    const { property } = (await response.json()) as { property: { id: string } };
    router.push(`/app/landlord/properties/${property.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <Card role="alert" className="border-danger p-4 text-sm text-danger">
          {error}
        </Card>
      )}

      <Card className="flex flex-col gap-4 p-5">
        <Field label="Nom du bien" htmlFor="label" hint="Le nom sous lequel vous le reconnaîtrez">
          <Input
            id="label"
            required
            maxLength={150}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <Field label="Type" htmlFor="propertyType">
          <Select
            id="propertyType"
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
          >
            {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Adresse" htmlFor="addressLine1">
          <Input
            id="addressLine1"
            required
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ville" htmlFor="city">
            <Input id="city" required value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Code postal" htmlFor="postalCode">
            <Input
              id="postalCode"
              required
              inputMode="numeric"
              pattern="\d{5}"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Ajout…" : "Ajouter le bien"}
      </Button>
    </form>
  );
}
