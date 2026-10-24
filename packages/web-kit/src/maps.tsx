"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- Google's script has no types installed here. */
import { useEffect, useRef, useState } from "react";
import { DEFAULT_CENTER, placeUrl, type Api, type GeoPoint } from "@yanabuy/shared";
import { useAuth } from "./auth";

declare global {
  interface Window {
    google?: any;
    __ybMaps?: Promise<any>;
    __ybMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}

// Google calls window.gm_authFailure when the key can't be used (billing off, API not enabled,
// site not allowed). Every map then switches to its "Open in Google Maps" links.
let authFailed = false;
const authListeners = new Set<() => void>();
function watchAuth() {
  if (typeof window === "undefined" || window.gm_authFailure) return;
  window.gm_authFailure = () => {
    authFailed = true;
    authListeners.forEach((fn) => fn());
  };
}

/** Loads Google's map script once per page. */
export function loadGoogleMaps(key: string): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("No browser"));
  if (window.google?.maps?.Map) return Promise.resolve(window.google);
  watchAuth();
  if (!window.__ybMaps) {
    window.__ybMaps = new Promise((resolve, reject) => {
      window.__ybMapsReady = () => resolve(window.google);
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__ybMapsReady&loading=async&v=weekly`;
      s.async = true;
      s.onerror = () => {
        window.__ybMaps = undefined;
        reject(new Error("Couldn't load Google Maps"));
      };
      document.head.appendChild(s);
    });
  }
  return window.__ybMaps;
}

export type MarkerColor = "purple" | "amber" | "orange" | "green" | "blue" | "gray" | "red";
const COLORS: Record<MarkerColor, string> = {
  purple: "#491F67",
  amber: "#FFAC00",
  orange: "#FF7500",
  green: "#1E9E5A",
  blue: "#2D6CDF",
  gray: "#8A8494",
  red: "#D33A3A",
};

export interface MapMarker {
  id: string;
  position: GeoPoint;
  color?: MarkerColor;
  /** One or two letters on the pin. */
  label?: string;
  title: string;
  /** Extra line shown when the pin is clicked. */
  info?: string;
}

interface MapProps {
  /** Google Maps key (NEXT_PUBLIC_GOOGLE_MAPS_KEY). Without one, a simple list with Google Maps links is shown. */
  apiKey: string;
  markers: MapMarker[];
  /** Where to look when there are no markers. */
  center?: GeoPoint | null;
  zoom?: number;
  height?: number | string;
  /** Tap/click the map to choose a spot. */
  onPick?: (p: GeoPoint) => void;
  /** A ring around a spot, e.g. the riders' search radius. */
  circle?: { center: GeoPoint; radiusKm: number } | null;
  className?: string;
  /** Re-fit the view when markers are added or removed (not when they only move). */
  fit?: boolean;
}

/** A Google map with coloured pins. */
export function GoogleMap({ apiKey, markers, center, zoom = 14, height = 280, onPick, circle, className = "", fit = true }: MapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const pins = useRef(new Map<string, any>());
  const ring = useRef<any>(null);
  const info = useRef<any>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [g, setG] = useState<any>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const idsKey = markers.map((m) => m.id).sort().join("|");

  useEffect(() => {
    const off = () => setFailed("Google Maps isn't set up for this key yet (check billing and the enabled APIs)");
    if (authFailed) off();
    authListeners.add(off);
    return () => {
      authListeners.delete(off);
    };
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    let live = true;
    loadGoogleMaps(apiKey)
      .then((google) => live && setG(google))
      .catch((e) => live && setFailed(e instanceof Error ? e.message : "Couldn't load the map"));
    return () => {
      live = false;
    };
  }, [apiKey]);

  // Create the map once.
  useEffect(() => {
    if (!g || !box.current || map.current) return;
    const start = markers[0]?.position ?? center ?? DEFAULT_CENTER;
    map.current = new g.maps.Map(box.current, {
      center: start,
      zoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      clickableIcons: false,
      gestureHandling: "cooperative",
    });
    info.current = new g.maps.InfoWindow();
    map.current.addListener("click", (e: any) => {
      const fn = pickRef.current;
      if (fn && e.latLng) fn({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g]);

  // Pins: add, move, remove.
  useEffect(() => {
    if (!g || !map.current) return;
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      const icon = {
        path: g.maps.SymbolPath.CIRCLE,
        scale: m.label ? 12 : 9,
        fillColor: COLORS[m.color ?? "purple"],
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2.5,
      };
      const label = m.label ? { text: m.label, color: "#ffffff", fontSize: "11px", fontWeight: "700" } : undefined;
      let pin = pins.current.get(m.id);
      if (!pin) {
        pin = new g.maps.Marker({ map: map.current, position: m.position, title: m.title, icon, label });
        pin.addListener("click", () => {
          const it = pin.__yb as MapMarker;
          const div = document.createElement("div");
          div.style.cssText = "font:13px system-ui,sans-serif;max-width:220px";
          const b = document.createElement("strong");
          b.textContent = it.title;
          div.appendChild(b);
          if (it.info) {
            const p = document.createElement("div");
            p.textContent = it.info;
            p.style.marginTop = "2px";
            div.appendChild(p);
          }
          const a = document.createElement("a");
          a.href = placeUrl(it.position);
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = "Open in Google Maps";
          a.style.cssText = "display:block;margin-top:4px;color:#491F67;font-weight:700";
          div.appendChild(a);
          info.current.setContent(div);
          info.current.open({ map: map.current, anchor: pin });
        });
        pins.current.set(m.id, pin);
      } else {
        pin.setPosition(m.position);
        pin.setIcon(icon);
        pin.setLabel(label ?? null);
        pin.setTitle(m.title);
      }
      pin.__yb = m;
    }
    for (const [id, pin] of pins.current) {
      if (!seen.has(id)) {
        pin.setMap(null);
        pins.current.delete(id);
      }
    }
  }, [g, markers]);

  // Fit the view to the pins when the set of pins changes.
  useEffect(() => {
    if (!g || !map.current || !fit) return;
    if (markers.length === 0) {
      if (center) map.current.setCenter(center);
      return;
    }
    if (markers.length === 1) {
      map.current.setCenter(markers[0].position);
      map.current.setZoom(zoom);
      return;
    }
    const b = new g.maps.LatLngBounds();
    markers.forEach((m) => b.extend(m.position));
    if (circle) {
      const d = circle.radiusKm / 111;
      b.extend({ lat: circle.center.lat + d, lng: circle.center.lng + d });
      b.extend({ lat: circle.center.lat - d, lng: circle.center.lng - d });
    }
    map.current.fitBounds(b, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, idsKey, fit]);

  useEffect(() => {
    if (!g || !map.current) return;
    if (!circle) {
      ring.current?.setMap(null);
      ring.current = null;
      return;
    }
    if (!ring.current) {
      ring.current = new g.maps.Circle({ map: map.current, strokeColor: "#491F67", strokeOpacity: 0.5, strokeWeight: 1.5, fillColor: "#491F67", fillOpacity: 0.06, clickable: false });
    }
    ring.current.setCenter(circle.center);
    ring.current.setRadius(circle.radiusKm * 1000);
  }, [g, circle?.center.lat, circle?.center.lng, circle?.radiusKm]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = { height: typeof height === "number" ? `${height}px` : height };

  if (!apiKey || failed) {
    map.current = null;
    pins.current.clear();
    ring.current = null;
    return (
      <div className={`flex flex-col gap-2 overflow-auto rounded-2xl border border-dashed border-line-strong bg-ground p-4 text-sm ${className}`} style={style}>
        <p className="text-[12.5px] text-muted">{failed ? `${failed}. ` : "The map turns on once a Google Maps key is added. "}Open each spot in Google Maps:</p>
        {markers.length ? (
          markers.map((m) => (
            <a key={m.id} href={placeUrl(m.position)} target="_blank" rel="noopener noreferrer" className="font-bold text-purple hover:underline">
              📍 {m.title}
              {m.info ? <span className="font-normal text-muted"> — {m.info}</span> : null}
            </a>
          ))
        ) : (
          <p className="text-muted">Nothing to show yet.</p>
        )}
      </div>
    );
  }
  return <div ref={box} className={`overflow-hidden rounded-2xl border border-line bg-ground ${className}`} style={style} role="region" aria-label="Map" />;
}

/** The browser's current spot (asks permission the first time). */
export function getCurrentPosition(timeoutMs = 15000): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("This browser can't share its location"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? "Location is blocked — allow it for this site in your browser settings"
              : "Couldn't find your location. Check that location is on and try again"
          )
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 }
    );
  });
}

const SENT_KEY = "yanabuy:location-sent";
const EVERY_MS = 5 * 60_000;

/**
 * Keeps the logged-in person's location up to date (every account has a current spot, so vendors and
 * riders can find them). Sends at most every 5 minutes, only while the tab is open. Renders nothing.
 */
export function LocationReporter({ api }: { api: Api }) {
  const { user } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (!userId || typeof navigator === "undefined" || !navigator.geolocation) return;
    let stopped = false;
    const send = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(SENT_KEY)) || 0;
      } catch {
        /* storage blocked */
      }
      if (Date.now() - last < EVERY_MS) return;
      try {
        const state = await navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((s) => s.state).catch(() => "prompt");
        if (state === "denied") return;
        const p = await getCurrentPosition();
        await api.me.setLocation(p);
        try {
          sessionStorage.setItem(SENT_KEY, String(Date.now()));
        } catch {
          /* storage blocked */
        }
      } catch {
        /* no location — try again later */
      }
    };
    void send();
    const t = window.setInterval(send, EVERY_MS);
    document.addEventListener("visibilitychange", send);
    return () => {
      stopped = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", send);
    };
  }, [api, userId]);
  return null;
}

/** A street address for a spot, from Google (needs the Geocoding API on the key). null if unknown. */
export async function addressFor(apiKey: string, p: GeoPoint): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const google = await loadGoogleMaps(apiKey);
    const geocoder = new google.maps.Geocoder();
    const { results } = await geocoder.geocode({ location: p });
    const best = (results ?? []).find((r: any) => !(r.types ?? []).includes("plus_code")) ?? results?.[0];
    return best?.formatted_address ?? null;
  } catch {
    return null;
  }
}
