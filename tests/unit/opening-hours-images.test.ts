import { describe, expect, it } from "vitest";
import { openingHoursSpecification, weeklyOpeningHours } from "@/lib/opening-hours";
import { canOptimizeImage } from "@/lib/images";

describe("weeklyOpeningHours", () => {
  it("lists Monday to Sunday, closed days included", () => {
    const week = weeklyOpeningHours([
      { weekday: 1, opensAt: "09:00", closesAt: "19:00" },
      { weekday: 6, opensAt: "14:00", closesAt: "18:30" },
      { weekday: 6, opensAt: "09:30", closesAt: "12:00" },
    ]);
    expect(week.map((d) => d.day)).toEqual([
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
      "Dimanche",
    ]);
    expect(week[0].hours).toBe("9 h – 19 h");
    expect(week[1].hours).toBe("Fermé");
    expect(week[5].hours).toBe("9 h 30 – 12 h, 14 h – 18 h 30");
  });

  it("maps weekdays to schema.org days", () => {
    expect(openingHoursSpecification([{ weekday: 0, opensAt: "10:00", closesAt: "12:00" }])).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Sunday",
        opens: "10:00",
        closes: "12:00",
      },
    ]);
  });
});

describe("canOptimizeImage", () => {
  const supabase = "https://abc.supabase.co";

  it("optimizes local files and our Supabase public storage only", () => {
    expect(canOptimizeImage("/images/demo/bureau.svg", supabase)).toBe(true);
    expect(
      canOptimizeImage("https://abc.supabase.co/storage/v1/object/public/space-photos/a.jpg", supabase)
    ).toBe(true);
  });

  it("leaves any other URL unoptimized, never fetched by our server", () => {
    expect(canOptimizeImage("https://tracker.example/pixel.gif", supabase)).toBe(false);
    expect(canOptimizeImage("//evil.example/a.jpg", supabase)).toBe(false);
    expect(
      canOptimizeImage("https://abc.supabase.co/storage/v1/object/sign/private/a.jpg", supabase)
    ).toBe(false);
    expect(canOptimizeImage("https://abc.supabase.co/storage/v1/object/public/a.jpg", undefined)).toBe(
      false
    );
    expect(
      canOptimizeImage(
        "http://127.0.0.1:54321/storage/v1/object/public/a.jpg",
        "http://127.0.0.1:54321"
      )
    ).toBe(false);
  });
});
