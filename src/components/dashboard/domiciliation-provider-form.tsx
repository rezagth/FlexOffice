"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * The licensed domiciliataire behind the MakomSpace offer (name and
 * prefectoral approval number). Shown to the company before it accepts the
 * contract; the offer cannot be switched on while it is empty.
 */
export function DomiciliationProviderForm({
  initialName,
  initialAgrementNumber,
}: {
  initialName: string;
  initialAgrementNumber: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [agrementNumber, setAgrementNumber] = useState(initialAgrementNumber);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/domiciliation-settings/provider", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, agrementNumber }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.issues?.[0]?.message ?? body?.error?.message ?? "L'enregistrement a échoué.");
        return;
      }
      setMessage("Enregistré.");
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <h2 className="text-base font-medium text-foreground">Domiciliataire agréé</h2>
      <p className="text-xs text-muted-foreground">
        La domiciliation est assurée par la société agréée ci-dessous. MakomSpace n&apos;est que l&apos;interface. Ces
        informations sont montrées au client avant qu&apos;il accepte le contrat.
      </p>
      <Field label="Raison sociale du domiciliataire" htmlFor="provider-name">
        <Input id="provider-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Numéro d'agrément préfectoral" htmlFor="provider-agrement">
        <Input id="provider-agrement" value={agrementNumber} maxLength={100} onChange={(e) => setAgrementNumber(e.target.value)} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {message && <span role="status" className="text-xs text-muted-foreground">{message}</span>}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
