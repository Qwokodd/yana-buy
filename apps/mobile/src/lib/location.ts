import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import type { GeoPoint } from "@yanabuy/shared";
import { api } from "@/lib/api";

/** Asks for location permission (once) and returns where the phone is now. */
export async function currentPosition(): Promise<GeoPoint> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== "granted") throw new Error("Location is off for YanaBuy. Turn it on in your phone settings so riders can find you.");
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    throw new Error("Couldn't find your location. Check that location (GPS) is on and try again.");
  }
}

/** The phone's idea of the street address for a spot (free, on the phone). */
export async function addressFor(p: GeoPoint): Promise<string | null> {
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
    if (!a) return null;
    const parts = [a.name && a.name !== a.street ? a.name : null, a.street, a.district, a.city ?? a.subregion].filter(Boolean);
    return parts.length ? Array.from(new Set(parts)).join(", ") : null;
  } catch {
    return null;
  }
}

const EVERY_MS = 5 * 60_000;

/**
 * Keeps the logged-in person's location up to date (when the app opens and comes back to the
 * front, at most every 5 minutes), so vendors and riders can find them.
 */
export function useLocationReporter(userId: string | null | undefined) {
  const last = useRef(0);
  useEffect(() => {
    if (!userId) return;
    const send = async () => {
      if (Date.now() - last.current < EVERY_MS) return;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        // Ask once; if they said no, don't keep asking.
        if (perm.status !== "granted" && !perm.canAskAgain) return;
        const p = await currentPosition();
        last.current = Date.now();
        await api.me.setLocation(p);
      } catch {
        /* no location now — try again next time */
      }
    };
    void send();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void send();
    });
    return () => sub.remove();
  }, [userId]);
}

/**
 * Riders: while "Online" and the app is open, sends their spot about every 30 seconds
 * (so shops see who's near and buyers can watch their order coming).
 */
export function useRiderTracking(online: boolean, onPoint?: (p: GeoPoint) => void) {
  const cb = useRef(onPoint);
  cb.current = onPoint;
  useEffect(() => {
    if (!online) return;
    let sub: Location.LocationSubscription | null = null;
    let stopped = false;
    let lastSent = 0;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted" || stopped) return;
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 30_000, distanceInterval: 20 }, (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        cb.current?.(p);
        if (Date.now() - lastSent < 25_000) return;
        lastSent = Date.now();
        api.me.setLocation(p).catch(() => {});
      });
      if (stopped) sub.remove();
    })().catch(() => {});
    return () => {
      stopped = true;
      sub?.remove();
    };
  }, [online]);
}
