import { describe, expect, it } from "vitest";
import type { Space } from "@/generated/prisma/client";
import { changedModeratedFields } from "@/server/domains/organizations/update-space";

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
