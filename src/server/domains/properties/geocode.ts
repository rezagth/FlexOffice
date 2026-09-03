import { logError } from "@/server/lib/logger";

/**
 * Turns a French postal address into coordinates via Nominatim
 * (OpenStreetMap's free geocoding API) — no API key is available for this
 * iteration, and Nominatim is the one geocoder usable without one. Its
 * usage policy caps at ~1 request/second and requires a descriptive
 * User-Agent, both honoured here; this is called once per property
 * creation, nowhere near that ceiling.
 *
 * Best-effort by design: a property is not blocked from being created just
 * because geocoding failed or the address doesn't resolve — `latitude`/
 * `longitude` simply stay null, exactly the state they were already
 * documented to have before any provider was wired up (see
 * `Property.latitude`'s own comment in schema.prisma). Never thrown from
 * here; a caller that wants to know why gets `null` and nothing else.
 */
export async function geocodeAddress(address: {
  addressLine1: string;
  city: string;
  postalCode: string;
  country?: string;
}): Promise<{ latitude: number; longitude: number } | null> {
  const query = [address.addressLine1, address.postalCode, address.city, address.country ?? "France"]
    .filter(Boolean)
    .join(", ");

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url, {
      headers: {
        // Required by Nominatim's usage policy — a generic fetch UA gets
        // blocked outright.
        "User-Agent": "OfficeFlex/1.0 (property geocoding; contact via /contact)",
      },
      // Never let a slow/unreachable geocoder hold up creating a property.
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;

    const results = (await response.json()) as Array<{ lat: string; lon: string }>;
    const first = results[0];
    if (!first) return null;

    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude };
  } catch (error) {
    logError({ event: "property.geocoding_failed", error });
    return null;
  }
}
