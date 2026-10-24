import type { GeoPoint } from "./types";

/** Straight-line distance in km between two map points. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "350 m" / "2.4 km". */
export function formatDistance(km: number): string {
  return km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** Opens Google Maps with driving directions to a spot (works on phones and computers, no key needed). */
export function directionsUrl(to: GeoPoint, from?: GeoPoint | null): string {
  const o = from ? `&origin=${from.lat},${from.lng}` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}${o}&travelmode=driving`;
}

/** Opens Google Maps at a spot. */
export function placeUrl(p: GeoPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
}

export const isPoint = (p: Partial<GeoPoint> | null | undefined): p is GeoPoint =>
  !!p && typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** Liberia's middle — where maps start when nothing else is known. */
export const DEFAULT_CENTER: GeoPoint = { lat: 6.3005, lng: -10.7969 }; // Monrovia

/** How long a rider's last GPS spot counts as "live". */
export const LIVE_MINUTES = 15;
