import { describe, expect, it } from "vitest";
import type { Space } from "@/generated/prisma/client";
import { changedModeratedFields, resolvedCapacityPatch } from "@/server/domains/organizations/update-space";

const space = {
  name: "Salle",
  description: "Lumineuse",
  type: "MEETING_ROOM",
  address: "1 rue",
  city: "Paris",
  postalCode: "75001",
  capacity: 8,
  halfDayPriceCents: 9000,
  dayPriceCents: 15000,
  discountPercent: null,
  accessInstructions: "Code 1",
  amenities: [],
} as unknown as Space;

/** FCT-15 / SEC-09 — which edits send a published listing back to review. */
describe("changedModeratedFields", () => {
  it("ignores fields re-sent with the same value (the form posts everything)", () => {
    expect(changedModeratedFields(space, { name: "Salle", dayPriceCents: 15000, discountPercent: null })).toEqual([]);
  });

  it("detects a change on each public field", () => {
    expect(changedModeratedFields(space, { name: "Autre" })).toEqual(["name"]);
    expect(changedModeratedFields(space, { discountPercent: 20 })).toEqual(["discountPercent"]);
    expect(changedModeratedFields(space, { capacity: 9, city: "Lyon" })).toEqual(["city", "capacity"]);
  });

  it("does not count non-public fields", () => {
    expect(changedModeratedFields(space, { accessInstructions: "Code 2", amenities: ["WIFI"] })).toEqual([]);
  });
});

/** R4 — never trust a client-submitted capacity for a fixed-capacity type,
 * even on a partial payload that doesn't resend `type`. */
describe("resolvedCapacityPatch", () => {
  it("forces capacity to 1 on a space that is already a café/poste, even if a different value is sent", () => {
    expect(resolvedCapacityPatch("CAFE_SPOT", { capacity: 50 })).toEqual({ capacity: 1 });
  });

  it("forces capacity to 1 when the edit itself changes the type to café/poste", () => {
    expect(resolvedCapacityPatch("DESK", { type: "CAFE_SPOT", capacity: 12 })).toEqual({ capacity: 1 });
  });

  it("leaves capacity alone for a type that doesn't fix one", () => {
    expect(resolvedCapacityPatch("MEETING_ROOM", { capacity: 12 })).toEqual({});
    expect(resolvedCapacityPatch("CAFE_SPOT", { type: "MEETING_ROOM", capacity: 12 })).toEqual({});
  });

  it("returns no patch at all when nothing is sent and the type stays fixed-capacity", () => {
    expect(resolvedCapacityPatch("CAFE_SPOT", {})).toEqual({ capacity: 1 });
  });
});
