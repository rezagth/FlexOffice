"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// react-leaflet's default marker icon resolves its image URLs relative to
// the page, which breaks under bundling — pointing at the same version's
// files on a CDN sidesteps the bundler asset pipeline entirely, rather than
// depending on how Turbopack happens to shape a static image import.
const defaultIcon = L.icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export type MapPoint = {
  slug: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
};

/**
 * Tiles from OpenStreetMap's own tile server — free, no API key, subject
 * to their usage policy (light traffic, attribution shown). Loaded only
 * for spaces whose property has coordinates (see list-spaces.ts); a search
 * with none simply renders no map, handled by the caller.
 */
export function SearchMap({ points, center }: { points: MapPoint[]; center: [number, number] }) {
  return (
    <MapContainer
      center={center}
      zoom={12}
      scrollWheelZoom={false}
      style={{ height: "320px", width: "100%", borderRadius: "1rem" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((point) => (
        <Marker key={point.slug} position={[point.lat, point.lng]} icon={defaultIcon}>
          <Popup>
            {point.name} · {point.city}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
