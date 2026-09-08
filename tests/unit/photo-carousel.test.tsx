// @vitest-environment jsdom
import { describe, expect, it, beforeAll } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { PhotoCarousel } from "@/components/marketing/photo-carousel";

// jsdom has no real layout engine and no window.matchMedia — Embla (the
// engine behind the shadcn Carousel PhotoCarousel is built on) reads
// matchMedia while resolving its responsive options and throws without a
// polyfill. A minimal stub is enough; nothing here asserts on actual
// media-query behavior.
beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  // Same reason: Embla also watches slide visibility via
  // IntersectionObserver and container/slide sizing via ResizeObserver,
  // neither of which jsdom implements.
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
});

describe("PhotoCarousel", () => {
  it("shows the empty-state message and no navigation when there are zero photos", () => {
    render(<PhotoCarousel photos={[]} spaceName="Salle Rivoli" />);

    expect(screen.getByText("Aucune photo pour cet espace")).toBeTruthy();
    expect(screen.queryAllByRole("img").length).toBe(0);
    expect(screen.queryByLabelText("Photo suivante")).toBeNull();
  });

  it("renders a single photo without prev/next controls, a counter, or thumbnails", () => {
    render(<PhotoCarousel photos={["https://cdn.test/a.jpg"]} spaceName="Salle Rivoli" />);

    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("alt")).toBe("Photo 1 sur 1 de Salle Rivoli");
    expect(screen.queryByLabelText("Photo suivante")).toBeNull();
    expect(screen.queryByLabelText("Photo précédente")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("renders every photo, a counter, prev/next controls, and one thumbnail per photo", () => {
    const photos = ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg", "https://cdn.test/c.jpg"];
    render(<PhotoCarousel photos={photos} spaceName="Salle Rivoli" />);

    // 3 full-size slides + 3 thumbnail images = 6 <img>.
    expect(screen.getAllByRole("img")).toHaveLength(6);
    expect(screen.getByText("1 / 3")).toBeTruthy();
    expect(screen.getByLabelText("Photo suivante")).toBeTruthy();
    expect(screen.getByLabelText("Photo précédente")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });
});
