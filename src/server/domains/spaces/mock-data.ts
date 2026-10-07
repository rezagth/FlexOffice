/**
 * Fallback demo data used only when no database is configured
 * (DATABASE_URL unset) — keeps the public marketing/search/space-detail
 * pages browsable for a demo deploy with zero infra. Never used once a
 * real DATABASE_URL is set; see list-spaces.ts.
 *
 * Photos are local illustrations in public/images/demo/ (one per demo
 * listing) — decorative stand-ins for this fictional data, served from our
 * own origin rather than hot-linked from a third party (UX-18).
 */
/** Monday–Friday, 09:00–19:00 — 0 = Sunday, like SpaceOpeningHours. */
const WEEKDAY_HOURS: { weekday: number; opensAt: string; closesAt: string }[] = [1, 2, 3, 4, 5].map(
  (weekday) => ({ weekday, opensAt: "09:00", closesAt: "19:00" })
);

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
      "/images/demo/salle-de-reunion.svg",
    ] as string[],
    halfDayPriceCents: 12000,
    dayPriceCents: 20000,
    discountPercent: null as number | null,
    status: "PUBLISHED" as const,
    organization: { name: "Atelier Partners", status: "VERIFIED" as const },
    property: { latitude: null as number | null, longitude: null as number | null },
    openingHours: WEEKDAY_HOURS,
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
      "/images/demo/bureau.svg",
    ] as string[],
    halfDayPriceCents: 4000,
    dayPriceCents: 7000,
    discountPercent: null as number | null,
    status: "PUBLISHED" as const,
    organization: { name: "Atelier Partners", status: "VERIFIED" as const },
    property: { latitude: null as number | null, longitude: null as number | null },
    openingHours: WEEKDAY_HOURS,
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
      "/images/demo/espace-de-formation.svg",
    ] as string[],
    halfDayPriceCents: 18000,
    dayPriceCents: 30000,
    discountPercent: 10 as number | null,
    status: "PUBLISHED" as const,
    organization: { name: "Confluence Bureaux", status: "PENDING_VERIFICATION" as const },
    property: { latitude: null as number | null, longitude: null as number | null },
    openingHours: WEEKDAY_HOURS,
  },
];
