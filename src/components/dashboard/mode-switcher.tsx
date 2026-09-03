"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";

/**
 * The tenant / landlord toggle.
 *
 * Purely a control: it asks the server to change the stored mode and then
 * refreshes. It never decides anything. The server checks the capability and
 * the membership (see switchMode()), so a hand-crafted request to
 * PUT /api/account/mode gets the same answer this button would — and pressing
 * a button that is not rendered is not a way in.
 *
 * A tenant-only account is shown the toggle in a disabled state pointing at
 * "Devenir bailleur", rather than not shown it at all: hiding it would leave
 * the single-account model invisible to exactly the people who need to
 * discover it.
 */
export function ModeSwitcher({
  activeMode,
  isLandlord,
  organizations,
  activeOrgId,
}: {
  activeMode: "TENANT" | "LANDLORD";
  isLandlord: boolean;
  organizations: Array<{ organizationId: string; organizationName: string }>;
  activeOrgId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchTo(mode: "TENANT" | "LANDLORD", organizationId?: string) {
    if (mode === activeMode && !organizationId) return;
    setPending(true);
    setError(null);

    const response = await fetch("/api/account/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, ...(organizationId ? { organizationId } : {}) }),
    });
    setPending(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Le changement de mode a échoué.");
      return;
    }

    // The mode lives on the server, so the rendered tree has to be rebuilt
    // rather than patched locally — the nav, the guards and the pages all
    // derive from it.
    router.push("/app");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Mode</p>

      <div role="group" aria-label="Mode d'utilisation" className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          aria-pressed={activeMode === "TENANT"}
          disabled={pending}
          onClick={() => switchTo("TENANT")}
          className={clsx(
            "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
            activeMode === "TENANT"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Locataire
        </button>
        <button
          type="button"
          aria-pressed={activeMode === "LANDLORD"}
          disabled={pending || !isLandlord}
          // Explains the disabled state instead of leaving a dead control.
          title={isLandlord ? undefined : "Activez d'abord votre activité de bailleur"}
          onClick={() => switchTo("LANDLORD")}
          className={clsx(
            "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
            activeMode === "LANDLORD"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Bailleur
        </button>
      </div>

      {/* Only shown when there is a genuine choice to make. */}
      {activeMode === "LANDLORD" && organizations.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Organisation</span>
          <select
            value={activeOrgId ?? ""}
            disabled={pending}
            onChange={(event) => switchTo("LANDLORD", event.target.value)}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground"
          >
            {organizations.map((org) => (
              <option key={org.organizationId} value={org.organizationId}>
                {org.organizationName}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
