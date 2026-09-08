"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select } from "@/components/ui/select";

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

      <ToggleGroup
        type="single"
        aria-label="Mode d'utilisation"
        value={activeMode}
        // A single-select ToggleGroup can report "" (deselected) when the
        // already-pressed item is clicked again — this domain always has
        // exactly one active mode, so an empty value is simply ignored.
        onValueChange={(value) => {
          if (value) switchTo(value as "TENANT" | "LANDLORD");
        }}
      >
        <ToggleGroupItem value="TENANT" disabled={pending}>
          Locataire
        </ToggleGroupItem>
        <ToggleGroupItem
          value="LANDLORD"
          disabled={pending || !isLandlord}
          // Explains the disabled state instead of leaving a dead control.
          title={isLandlord ? undefined : "Activez d'abord votre activité de bailleur"}
        >
          Bailleur
        </ToggleGroupItem>
      </ToggleGroup>

      {/* Only shown when there is a genuine choice to make. */}
      {activeMode === "LANDLORD" && organizations.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Organisation</span>
          <Select
            value={activeOrgId ?? ""}
            disabled={pending}
            onChange={(event) => switchTo("LANDLORD", event.target.value)}
            className="h-auto py-1.5 text-xs"
          >
            {organizations.map((org) => (
              <option key={org.organizationId} value={org.organizationId}>
                {org.organizationName}
              </option>
            ))}
          </Select>
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
