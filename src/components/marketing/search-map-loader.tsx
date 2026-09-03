"use client";

import dynamic from "next/dynamic";
import type { MapPoint } from "./search-map";

// Next.js 16 refuses `ssr: false` inside a Server Component — it must be
// called from a Client Component, hence this thin wrapper. The Server
// Component (search/page.tsx) imports this normally; Leaflet itself never
// touches `window` until this loads on the client.
const SearchMap = dynamic(() => import("./search-map").then((m) => m.SearchMap), {
  ssr: false,
});

export function SearchMapLoader({
  points,
  center,
}: {
  points: MapPoint[];
  center: [number, number];
}) {
  return <SearchMap points={points} center={center} />;
}
