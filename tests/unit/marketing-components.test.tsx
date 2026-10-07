// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
let currentParams = new URLSearchParams("city=Paris");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => currentParams,
  usePathname: () => "/search",
}));

const { SearchGeolocation } = await import("@/components/marketing/search-geolocation");
const { SpaceCard } = await import("@/components/marketing/space-card");
const { HeroSearch } = await import("@/components/marketing/hero-search");

const getCurrentPosition = vi.fn();

beforeEach(() => {
  push.mockReset();
  getCurrentPosition.mockReset();
  currentParams = new URLSearchParams("city=Paris&page=3");
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
});
afterEach(cleanup);

describe("SearchGeolocation (B-18)", () => {
  it("never asks for the position on page load", async () => {
    render(<SearchGeolocation />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(screen.queryByText(/refus|non disponible/i)).toBeNull();
  });

  it("asks on click and searches around the position, back to page 1", () => {
    getCurrentPosition.mockImplementation((success: PositionCallback) =>
      success({ coords: { latitude: 48.8566, longitude: 2.3522 } } as GeolocationPosition)
    );
    render(<SearchGeolocation />);
    fireEvent.click(screen.getByRole("button", { name: "Autour de moi" }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/search?city=Paris&lat=48.856600&lng=2.352200");
  });

  it("explains a refusal only after the visitor asked", () => {
    getCurrentPosition.mockImplementation((_s: PositionCallback, error: PositionErrorCallback) =>
      error({ code: 1 } as GeolocationPositionError)
    );
    render(<SearchGeolocation />);
    fireEvent.click(screen.getByRole("button", { name: "Autour de moi" }));
    expect(screen.getByRole("status").textContent).toMatch(/Position non disponible/);
  });
});

describe("SpaceCard (B-14)", () => {
  const space = {
    id: "space-1",
    slug: "salle-rivoli",
    name: "Salle Rivoli",
    type: "MEETING_ROOM",
    city: "Paris",
    capacity: 8,
    amenities: [],
    dayPriceCents: 20000,
    photos: ["/images/demo/salle-de-reunion.svg"],
    organization: { name: "Atelier Partners", status: "VERIFIED" },
  };

  it("shows no rating of any kind", () => {
    const { container } = render(<SpaceCard space={space} href="/spaces/salle-rivoli" />);
    expect(container.textContent).not.toMatch(/\b\d[.,]\d\b/);
    expect(container.querySelector("svg.lucide-star")).toBeNull();
    expect(container.textContent).not.toMatch(/avis|note/i);
  });

  it("links to the space without nesting the favorite button in the link", () => {
    render(<SpaceCard space={{ ...space, favorited: false }} href="/spaces/salle-rivoli?date=2026-10-12" />);
    const link = screen.getByRole("link", { name: "Salle Rivoli" });
    expect(link.getAttribute("href")).toBe("/spaces/salle-rivoli?date=2026-10-12");
    const favorite = screen.getByRole("button", { name: "Ajouter aux favoris" });
    expect(link.contains(favorite)).toBe(false);
  });
});

describe("HeroSearch (B-17)", () => {
  it("keeps the submit button inside the search form, with labelled fields", () => {
    render(<HeroSearch />);
    const form = screen.getByRole("search");
    expect(form.contains(screen.getByRole("button", { name: "Rechercher" }))).toBe(true);
    expect(form.getAttribute("action")).toBe("/search");
    expect(screen.getByLabelText(/Où \?/)).toBeTruthy();
    expect(screen.getByLabelText(/Quand \?/)).toBeTruthy();
    expect(screen.getByLabelText(/Capacité/)).toBeTruthy();
  });
});
