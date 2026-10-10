"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type RunResult = { organizationId: string; outcome: "generated" | "existing" | "nothing_to_bill" | "failed" };

const OUTCOME_LABELS: Record<RunResult["outcome"], string> = {
  generated: "générés",
  existing: "déjà existants",
  nothing_to_bill: "sans commission à facturer",
  failed: "en échec",
};

/** Admin "Générer maintenant": every organization for one finished month.
 * Idempotent server-side, so a double click cannot bill twice. */
export function GenerateCommissionStatementsForm({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(defaultMonth);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/commission-statements/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(body?.error?.message ?? "La génération a échoué.");
        return;
      }
      const results: RunResult[] = body?.results ?? [];
      if (results.length === 0) {
        setMessage("Aucun paiement encaissé sur ce mois : rien à générer.");
      } else {
        const counts = (Object.keys(OUTCOME_LABELS) as RunResult["outcome"][])
          .map((outcome) => [outcome, results.filter((r) => r.outcome === outcome).length] as const)
          .filter(([, count]) => count > 0)
          .map(([outcome, count]) => `${count} ${OUTCOME_LABELS[outcome]}`);
        setMessage(`Relevés : ${counts.join(", ")}.`);
      }
      router.refresh();
    } catch {
      setMessage("La génération a échoué. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Mois" htmlFor="statement-month">
          <Input
            id="statement-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            required
          />
        </Field>
        <Button type="submit" size="md" disabled={pending || !month}>
          {pending ? "Génération…" : "Générer maintenant"}
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </form>
  );
}
