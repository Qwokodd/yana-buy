"use client";

import { directionsUrl, isPoint, type GeoPoint, type Order } from "@yanabuy/shared";
import { GoogleMap, type MapMarker } from "@yanabuy/web-kit";
import { MAPS_KEY } from "@/lib/maps";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/** The shop, the delivery spot and (when there is one) the rider, on one map. */
export function OrderMap({ order, extra = [], height = 280, title = "On the map" }: { order: Order; extra?: MapMarker[]; height?: number; title?: string }) {
  const drop: GeoPoint | null = isPoint({ lat: order.delivery.lat ?? undefined, lng: order.delivery.lng ?? undefined })
    ? { lat: order.delivery.lat!, lng: order.delivery.lng! }
    : null;
  const markers: MapMarker[] = [];
  if (order.shop.location) markers.push({ id: "shop", position: order.shop.location, color: "purple", label: "S", title: order.shop.name, info: order.shop.address });
  if (drop) markers.push({ id: "drop", position: drop, color: "orange", label: "D", title: `Deliver to ${order.delivery.name}`, info: order.delivery.address });
  if (order.riderLocation && order.rider && !["delivered", "cancelled"].includes(order.status)) {
    markers.push({ id: "rider", position: order.riderLocation, color: "green", label: "R", title: order.rider.fullName, info: `Rider · updated ${ago(order.riderLocation.at)}` });
  }
  markers.push(...extra);
  if (!markers.length) return null;
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-5" aria-label="Map">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">{title}</h2>
        <div className="flex gap-3 text-[13px] font-bold">
          {drop && (
            <a href={directionsUrl(drop, order.shop.location)} target="_blank" rel="noopener noreferrer" className="text-purple hover:underline">
              Directions to the drop-off ↗
            </a>
          )}
        </div>
      </div>
      <GoogleMap apiKey={MAPS_KEY} markers={markers} height={height} />
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        {order.shop.location && <span>🟣 S — shop</span>}
        {drop ? <span>🟠 D — drop-off</span> : <span>No drop-off pin — the address above is used.</span>}
        {markers.some((m) => m.id === "rider") && <span>🟢 R — rider (live)</span>}
      </p>
    </section>
  );
}
