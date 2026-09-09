/**
 * Fallback demo data used only when no database is configured
 * (DATABASE_URL unset) — keeps the public marketing/search/space-detail
 * pages browsable for a demo deploy with zero infra. Never used once a
 * real DATABASE_URL is set; see list-spaces.ts.
 *
 * Photo URLs are real photography (Unsplash License — free for commercial
 * use, verified individually), one per demo listing. These are decorative
 * stand-ins for this fictional demo data itself, not photos attributed to
 * a real host — no different in kind from the rest of this file's made-up
 * names and addresses.
 */
export const MOCK_SPACES = [
  {
    id: "mock-1",
    slug: "salle-rivoli-paris",
    name: "Salle Rivoli",
    type: "MEETING_ROOM",
    description:
      "Salle de réunion lumineuse en plein cœur de Paris, écran et visioconférence inclus.",
    address: "12 rue de Rivoli",
    city: "Paris",
    postalCode: "75004",
    capacity: 8,
    amenities: ["Wifi", "Écran", "Caméra", "Tableau blanc"],
    photos: [
      "https://images.unsplash.com/photo-1697059361461-b81d0e98c3af?auto=format&fit=crop&w=1200&q=80",
    ] as string[],
    halfDayPriceCents: 12000,
    dayPriceCents: 20000,
    discountPercent: null as number | null,
    status: "PUBLISHED" as const,
    organization: { name: "Atelier Partners", status: "VERIFIED" as const },
    property: { latitude: null as number | null, longitude: null as number | null },
    openingHours: [] as { weekday: number; opensAt: string; closesAt: string }[],
  },
  {
    id: "mock-2",
    slug: "bureau-flex-paris",
    name: "Bureau individuel Flex",
    type: "DESK",
    description: "Bureau calme pour un rendez-vous client ou une journée concentrée.",
    address: "12 rue de Rivoli",
    city: "Paris",
    postalCode: "75004",
    capacity: 2,
    amenities: ["Wifi", "Imprimante"],
    photos: [
      "https://images.unsplash.com/photo-1694919123854-24b74b376da1?auto=format&fit=crop&w=1200&q=80",
    ] as string[],
    halfDayPriceCents: 4000,
    dayPriceCents: 7000,
    discountPercent: null as number | null,
    status: "PUBLISHED" as const,
    organization: { name: "Atelier Partners", status: "VERIFIED" as const },
    property: { latitude: null as number | null, longitude: null as number | null },
    openingHours: [] as { weekday: number; opensAt: string; closesAt: string }[],
  },
  {
    id: "mock-3",
    slug: "espace-formation-confluence",
    name: "Espace formation Confluence",
    type: "TRAINING_ROOM",
    description: "Grand espace modulable pour formations et ateliers jusqu'à 20 personnes.",
    address: "5 quai Perrache",
    city: "Lyon",
    postalCode: "69002",
    capacity: 20,
    amenities: ["Wifi", "Vidéoprojecteur", "Paperboard", "Parking"],
    photos: [
      "https://images.unsplash.com/photo-1762176263996-a0713a49ee4d?auto=format&fit=crop&w=1200&q=80",
    ] as string[],
    halfDayPriceCents: 18000,
    dayPriceCents: 30000,
    discountPercent: 10 as number | null,
    status: "PUBLISHED" as const,
    organization: { name: "Confluence Bureaux", status: "PENDING_VERIFICATION" as const },
    property: { latitude: null as number | null, longitude: null as number | null },
    openingHours: [] as { weekday: number; opensAt: string; closesAt: string }[],
  },
];
