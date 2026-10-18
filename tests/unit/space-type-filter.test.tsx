// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SpaceTypeFilter } from "@/components/marketing/space-type-filter";

afterEach(() => {
  cleanup();
});

/**
 * PRD V1.1, R3-R6 — café/poste was removed (it was only a landing-page
 * comparison example, R1/R2, never a space type): the search filter offers
 * exactly the 3 real SpaceType values, and the capacity field only appears
 * once one of them is chosen.
 */
describe("SpaceTypeFilter", () => {
  it("offers exactly Bureau, Salle de réunion and Salle de formation — no café/poste", () => {
    render(<SpaceTypeFilter />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Tous les types", "Salle de réunion", "Bureau", "Espace de formation"]);
  });

  it("hides the capacity field until a type is chosen", () => {
    render(<SpaceTypeFilter />);
    expect(screen.queryByLabelText("Capacité minimale")).toBeNull();

    fireEvent.change(screen.getByLabelText("Type d'espace"), { target: { value: "DESK" } });
    expect(screen.getByLabelText("Capacité minimale")).not.toBeNull();
  });

  it("shows the capacity field immediately when a default type comes from the URL", () => {
    render(<SpaceTypeFilter defaultType="MEETING_ROOM" defaultCapacity={10} />);
    const capacity = screen.getByLabelText("Capacité minimale") as HTMLInputElement;
    expect(capacity.value).toBe("10");
  });

  it("switches Bureau to Salle de réunion at 6+ people, and says so", () => {
    render(<SpaceTypeFilter />);
    fireEvent.change(screen.getByLabelText("Type d'espace"), { target: { value: "DESK" } });
    fireEvent.change(screen.getByLabelText("Capacité minimale"), { target: { value: "6" } });

    const select = screen.getByLabelText("Type d'espace") as HTMLSelectElement;
    expect(select.value).toBe("MEETING_ROOM");
    expect(screen.getByRole("status").textContent).toMatch(/Salle de réunion/);
  });

  it("does not switch below the 6-person threshold", () => {
    render(<SpaceTypeFilter />);
    fireEvent.change(screen.getByLabelText("Type d'espace"), { target: { value: "DESK" } });
    fireEvent.change(screen.getByLabelText("Capacité minimale"), { target: { value: "5" } });

    expect((screen.getByLabelText("Type d'espace") as HTMLSelectElement).value).toBe("DESK");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("never switches Salle de formation, whatever the capacity", () => {
    render(<SpaceTypeFilter />);
    fireEvent.change(screen.getByLabelText("Type d'espace"), { target: { value: "TRAINING_ROOM" } });
    fireEvent.change(screen.getByLabelText("Capacité minimale"), { target: { value: "50" } });

    expect((screen.getByLabelText("Type d'espace") as HTMLSelectElement).value).toBe("TRAINING_ROOM");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("is a default, not a lock: 'Revenir à Bureau' and manually reselecting Bureau both work", () => {
    render(<SpaceTypeFilter />);
    const select = screen.getByLabelText("Type d'espace") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "DESK" } });
    fireEvent.change(screen.getByLabelText("Capacité minimale"), { target: { value: "8" } });
    expect(select.value).toBe("MEETING_ROOM");

    fireEvent.click(screen.getByRole("button", { name: "Revenir à Bureau" }));
    expect(select.value).toBe("DESK");
    expect(screen.queryByRole("status")).toBeNull();

    // Picking "Bureau" again from the dropdown is never fought back, even
    // though capacity is still 8 — the switch only reacts to a capacity
    // change, not to the type being set back.
    fireEvent.change(select, { target: { value: "MEETING_ROOM" } });
    fireEvent.change(select, { target: { value: "DESK" } });
    expect(select.value).toBe("DESK");
  });

  it("clears the notice when the type is changed manually", () => {
    render(<SpaceTypeFilter />);
    fireEvent.change(screen.getByLabelText("Type d'espace"), { target: { value: "DESK" } });
    fireEvent.change(screen.getByLabelText("Capacité minimale"), { target: { value: "7" } });
    expect(screen.queryByRole("status")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Type d'espace"), { target: { value: "TRAINING_ROOM" } });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
