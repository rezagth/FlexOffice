import { describe, expect, it } from "vitest";
import {
  parseSpaceSearchParams,
  searchPageHref,
  searchParamsToRecord,
} from "@/lib/validation/search";

describe("parseSpaceSearchParams", () => {
  it("defaults to the first page of 24, sorted by relevance", () => {
    expect(parseSpaceSearchParams({})).toEqual({
      city: undefined,
      near: undefined,
      capacity: undefined,
      amenities: [],
      date: undefined,
      type: undefined,
      maxPriceCents: undefined,
      sort: "relevance",
      page: 1,
      limit: 24,
    });
  });

  it("reads every filter and converts the maximum price from euros to cents", () => {
    const parsed = parseSpaceSearchParams({
      city: "  Lyon ",
      capacity: "6",
      amenities: ["WIFI", "PARKING"],
      date: "2026-10-12",
      type: "TRAINING_ROOM",
      maxPrice: "250",
      sort: "price_desc",
      page: "3",
      lat: "45.75",
      lng: "4.85",
    });
    expect(parsed).toMatchObject({
      city: "Lyon",
      capacity: 6,
      amenities: ["WIFI", "PARKING"],
      date: "2026-10-12",
      type: "TRAINING_ROOM",
      maxPriceCents: 25_000,
      sort: "price_desc",
      page: 3,
      near: { lat: 45.75, lng: 4.85 },
    });
  });

  it("drops malformed values instead of failing the whole search", () => {
    const parsed = parseSpaceSearchParams({
      capacity: "-2",
      amenities: ["WIFI", "DROP TABLE", "WIFI"],
      date: "2026-02-31",
      type: "BALLROOM",
      maxPrice: "abc",
      sort: "random",
      page: "0",
      limit: "5000",
      lat: "200",
      lng: "2",
    });
    expect(parsed).toMatchObject({
      capacity: undefined,
      amenities: ["WIFI"],
      date: undefined,
      type: undefined,
      maxPriceCents: undefined,
      sort: "relevance",
      page: 1,
      limit: 24,
      near: undefined,
    });
  });

  it("caps the page number", () => {
    expect(parseSpaceSearchParams({ page: "999999" }).page).toBe(1);
    expect(parseSpaceSearchParams({ page: "200" }).page).toBe(200);
  });

  it("reads a URLSearchParams with repeated keys", () => {
    const record = searchParamsToRecord(new URLSearchParams("amenities=WIFI&amenities=SCREEN&city=Paris"));
    expect(parseSpaceSearchParams(record)).toMatchObject({
      city: "Paris",
      amenities: ["WIFI", "SCREEN"],
    });
  });
});

describe("searchPageHref", () => {
  it("keeps every filter and only changes the page", () => {
    expect(searchPageHref({ city: "Paris", amenities: ["WIFI", "SCREEN"], page: "2" }, 3)).toBe(
      "/search?city=Paris&amenities=WIFI&amenities=SCREEN&page=3"
    );
  });

  it("leaves page 1 implicit", () => {
    expect(searchPageHref({ city: "Paris", page: "4" }, 1)).toBe("/search?city=Paris");
    expect(searchPageHref({}, 1)).toBe("/search");
  });
});
