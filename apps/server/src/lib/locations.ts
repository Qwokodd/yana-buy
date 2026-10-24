import { and, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { HEAVY_VEHICLES, LIVE_MINUTES, distanceKm, orderNumber, vehicleCanCarry, type GeoPoint, type NearbyRider } from "@yanabuy/shared";
import { alias } from "drizzle-orm/pg-core";
import { notify } from "./notify";
import { db } from "../db/client";
import { orders, riderApplications, settings, shops, users, type OrderRow, type ShopRow, type UserRow } from "../db/schema";
import { lastLocation } from "./serialize";

const RADIUS_KEY = "rider_radius_km";
export const DEFAULT_RADIUS_KM = 5;

/** How far from a shop riders can be and still show as "nearby" (admin setting). */
export async function getRiderRadius(): Promise<number> {
  const [row] = await db.select().from(settings).where(eq(settings.key, RADIUS_KEY)).limit(1);
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RADIUS_KM;
}

export async function saveRiderRadius(km: number, adminId: string) {
  const now = new Date();
  await db
    .insert(settings)
    .values({ key: RADIUS_KEY, value: km, updatedAt: now, updatedById: adminId })
    .onConflictDoUpdate({ target: settings.key, set: { value: km, updatedAt: now, updatedById: adminId } });
}

/** Saves someone's current spot. */
export async function saveLocation(userId: string, p: GeoPoint) {
  await db.update(users).set({ lat: p.lat, lng: p.lng, locatedAt: new Date() }).where(eq(users.id, userId));
}

/** The shop's pin, or else where its owner last was (most sellers work from their shop). */
export async function shopPoint(shop: Pick<ShopRow, "lat" | "lng" | "ownerId">): Promise<GeoPoint | null> {
  if (shop.lat != null && shop.lng != null) return { lat: shop.lat, lng: shop.lng };
  const [o] = await db.select({ lat: users.lat, lng: users.lng }).from(users).where(eq(users.id, shop.ownerId)).limit(1);
  return o?.lat != null && o?.lng != null ? { lat: o.lat, lng: o.lng } : null;
}

const liveSince = () => new Date(Date.now() - LIVE_MINUTES * 60_000);
const activeCount = sql<number>`(select count(*)::int from ${orders} o where o.rider_id = ${users.id} and o.status in ('accepted','ready','picked_up'))`;

/** Does this order need a keke or car (over the admin's heavy-order weight)? */
export const isHeavy = (o: Pick<OrderRow, "deliveryFeeBreakdown">) => !!o.deliveryFeeBreakdown?.heavy;

/** The vehicle on this rider's approved application, or null. */
export async function riderVehicleOf(userId: string): Promise<string | null> {
  const [a] = await db
    .select({ vehicle: riderApplications.vehicle })
    .from(riderApplications)
    .where(and(eq(riderApplications.userId, userId), eq(riderApplications.status, "approved")))
    .limit(1);
  return a?.vehicle ?? null;
}

/**
 * Online riders with a fresh GPS spot, nearest first. With `from`, only those within the radius.
 * With `heavy`, riders whose vehicle can't take it are marked `canCarry: false` (still listed).
 */
export async function onlineRiders(from: GeoPoint | null, opts: { radiusKm?: number; declined?: string[]; heavy?: boolean } = {}): Promise<NearbyRider[]> {
  const rows = await db
    .select({ u: users, active: activeCount })
    .from(users)
    .where(
      and(
        eq(users.role, "rider"),
        eq(users.status, "active"),
        eq(users.riderOnline, true),
        isNull(users.deletedAt),
        isNotNull(users.lat),
        isNotNull(users.lng),
        gt(users.locatedAt, liveSince())
      )
    )
    .limit(500);
  if (!rows.length) return [];
  const apps = await db
    .select({ userId: riderApplications.userId, vehicle: riderApplications.vehicle })
    .from(riderApplications)
    .where(and(inArray(riderApplications.userId, rows.map((r) => r.u.id)), eq(riderApplications.status, "approved")));
  const declined = new Set(opts.declined ?? []);
  const out = rows.map(({ u, active }) => {
    const location = lastLocation(u)!;
    const vehicle = apps.find((a) => a.userId === u.id)?.vehicle ?? null;
    return {
      id: u.id,
      fullName: u.fullName,
      phone: u.phone,
      avatarUrl: u.avatarUrl,
      location,
      distanceKm: from ? distanceKm(from, location) : 0,
      activeDeliveries: active,
      vehicle,
      declined: declined.has(u.id),
      canCarry: vehicleCanCarry(vehicle, !!opts.heavy),
    };
  });
  const radius = opts.radiusKm;
  return out.filter((r) => !from || radius == null || r.distanceKm <= radius).sort((a, b) => a.distanceKm - b.distanceKm || a.activeDeliveries - b.activeDeliveries);
}

const shopOwner = alias(users, "job_shop_owner");
/** Most riders told about one packed order (nearest first) — keeps texts and pushes in check. */
const BROADCAST_MAX = 25;

/**
 * A shop marked an order packed and nobody is delivering it yet: tell every online rider within the
 * radius. Whoever accepts first gets it. Returns how many riders were told.
 */
export async function broadcastPickup(orderId: string): Promise<number> {
  const [row] = await db
    .select({ o: orders, s: shops })
    .from(orders)
    .innerJoin(shops, eq(shops.id, orders.shopId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row || row.o.riderId || row.o.status !== "ready" || row.o.fulfilment !== "delivery") return 0;
  const from = await shopPoint(row.s);
  if (!from) return 0;
  const radiusKm = await getRiderRadius();
  const declined = new Set(row.o.declinedRiderIds ?? []);
  // Heavy orders only go to riders on a keke or car.
  const near = (await onlineRiders(from, { radiusKm, heavy: isHeavy(row.o) })).filter((r) => r.canCarry && !declined.has(r.id)).slice(0, BROADCAST_MAX);
  if (!near.length) return 0;
  notify(
    near.map((r) => r.id),
    {
      type: "order",
      title: `Pickup near you: ${orderNumber(row.o.number ?? 0)}`,
      body: `${row.s.name} has an order packed and ready. First rider to accept gets it.`,
      link: "/rider",
    }
  );
  return near.length;
}

/**
 * Packed, unassigned orders whose shop is within the radius of this (online) rider, nearest first.
 * Heavy orders only show to riders on a keke or car.
 */
export async function openJobsFor(rider: Pick<UserRow, "id" | "lat" | "lng" | "riderOnline">): Promise<{ id: string; distanceKm: number }[]> {
  if (!rider.riderOnline || rider.lat == null || rider.lng == null) return [];
  const me = { lat: rider.lat, lng: rider.lng };
  const radiusKm = await getRiderRadius();
  const canCarryHeavy = (HEAVY_VEHICLES as string[]).includes((await riderVehicleOf(rider.id)) ?? "");
  const rows = await db
    .select({ id: orders.id, declined: orders.declinedRiderIds, breakdown: orders.deliveryFeeBreakdown, sLat: shops.lat, sLng: shops.lng, oLat: shopOwner.lat, oLng: shopOwner.lng })
    .from(orders)
    .innerJoin(shops, eq(shops.id, orders.shopId))
    .innerJoin(shopOwner, eq(shopOwner.id, shops.ownerId))
    .where(and(eq(orders.status, "ready"), isNull(orders.riderId), eq(orders.fulfilment, "delivery")))
    .limit(300);
  const out: { id: string; distanceKm: number }[] = [];
  for (const r of rows) {
    if ((r.declined ?? []).includes(rider.id)) continue;
    if (r.breakdown?.heavy && !canCarryHeavy) continue;
    const lat = r.sLat ?? r.oLat;
    const lng = r.sLng ?? r.oLng;
    if (lat == null || lng == null) continue;
    const d = distanceKm(me, { lat, lng });
    if (d <= radiusKm) out.push({ id: r.id, distanceKm: d });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}
