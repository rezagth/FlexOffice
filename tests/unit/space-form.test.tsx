// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// Radix Checkbox (amenities) measures itself; jsdom has no ResizeObserver.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { SpaceForm } = await import("@/components/dashboard/space-form");

afterEach(() => {
  cleanup();
});

/** PRD V1.1, R3 — café/poste was only a landing-page comparison example
 * (R1/R2), never a space type: the publish form's Type field must keep
 * exactly the 3 real SpaceType values. */
describe("SpaceForm — type options", () => {
  it("offers exactly Salle de réunion, Bureau and Espace de formation — no café/poste", () => {
    render(<SpaceForm properties={[{ id: "prop-1", label: "Bien Test" }]} />);
    const options = screen
      .getByLabelText("Type")
      .querySelectorAll("option");
    expect([...options].map((o) => o.textContent)).toEqual([
      "Salle de réunion",
      "Bureau",
      "Espace de formation",
    ]);
  });
});
