// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { SpaceForm } = await import("@/components/dashboard/space-form");

afterEach(() => {
  cleanup();
});

/**
 * PRD V1.1, R3-R4 — the publish form's capacity field reacts to the chosen
 * type: café/poste is bounded to 1-2 people, every other type keeps the
 * generic 1-1000 range. The server re-checks the same bound regardless (see
 * tests/unit/validation-spaces.test.ts and organizations/update-space.ts) —
 * this is the form half: the field itself must not let a partner type in a
 * value the server will reject anyway.
 */
describe("SpaceForm — capacity bounds follow the selected type", () => {
  beforeEach(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it("the capacity field is present and editable for every type, not hidden for café/poste", () => {
    render(<SpaceForm properties={[{ id: "prop-1", label: "Bien Test" }]} />);
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "CAFE_SPOT" } });

    const capacity = screen.getByLabelText("Capacité (personnes)") as HTMLInputElement;
    expect(capacity.disabled).toBe(false);
    expect(capacity.hidden).toBe(false);
  });

  it("narrows the capacity field to 1-2 for café/poste", () => {
    render(<SpaceForm properties={[{ id: "prop-1", label: "Bien Test" }]} />);
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "CAFE_SPOT" } });

    const capacity = screen.getByLabelText("Capacité (personnes)") as HTMLInputElement;
    expect(capacity.min).toBe("1");
    expect(capacity.max).toBe("2");
    expect(screen.getByText(/Entre 1 et 2 pour ce type d'espace/)).not.toBeNull();
  });

  it("keeps the generic 1-1000 range for bureau and salle de réunion", () => {
    render(<SpaceForm properties={[{ id: "prop-1", label: "Bien Test" }]} />);
    const capacity = screen.getByLabelText("Capacité (personnes)") as HTMLInputElement;

    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "DESK" } });
    expect(capacity.max).toBe("1000");

    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "MEETING_ROOM" } });
    expect(capacity.max).toBe("1000");
  });

  it("clamps an already-entered capacity down when switching to café/poste", () => {
    render(<SpaceForm properties={[{ id: "prop-1", label: "Bien Test" }]} />);
    const capacity = screen.getByLabelText("Capacité (personnes)") as HTMLInputElement;

    fireEvent.change(capacity, { target: { value: "8" } });
    expect(capacity.value).toBe("8");

    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "CAFE_SPOT" } });
    expect(capacity.value).toBe("2");
  });

  it("does not clamp a value already within café/poste's range", () => {
    render(<SpaceForm properties={[{ id: "prop-1", label: "Bien Test" }]} />);
    const capacity = screen.getByLabelText("Capacité (personnes)") as HTMLInputElement;

    fireEvent.change(capacity, { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "CAFE_SPOT" } });
    expect(capacity.value).toBe("1");
  });
});
