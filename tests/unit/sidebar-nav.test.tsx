// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

let pathname = "/app/bookings";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const { activeNavHref, CollapsibleSidebar, SidebarNav } = await import("@/components/ui/sidebar-nav");

afterEach(cleanup);

const ITEMS = [
  { href: "/app", label: "Accueil" },
  { href: "/app/bookings", label: "Réservations" },
  { href: "/app/landlord/properties", label: "Mes biens" },
];

describe("activeNavHref", () => {
  it("picks the most specific item, never the parent", () => {
    expect(activeNavHref("/app", ITEMS)).toBe("/app");
    expect(activeNavHref("/app/bookings", ITEMS)).toBe("/app/bookings");
    expect(activeNavHref("/app/landlord/properties/123/spaces/4", ITEMS)).toBe(
      "/app/landlord/properties"
    );
    expect(activeNavHref("/app/messages", ITEMS)).toBe("/app");
    expect(activeNavHref("/application", ITEMS)).toBeNull();
  });
});

describe("SidebarNav", () => {
  it("marks only the current page with aria-current", () => {
    pathname = "/app/bookings";
    render(<SidebarNav items={ITEMS} label="Navigation" />);
    expect(screen.getByRole("link", { name: "Réservations" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Accueil" }).getAttribute("aria-current")).toBeNull();
  });
});

describe("CollapsibleSidebar", () => {
  it("folds the menu behind a button that reports its state", () => {
    render(
      <CollapsibleSidebar brand={<span>MakomSpace</span>}>
        <p>contenu du menu</p>
      </CollapsibleSidebar>
    );
    const toggle = screen.getByRole("button", { name: "Menu" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("sidebar-menu")?.className).toContain("hidden");

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Fermer" }).getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("sidebar-menu")?.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });
});
