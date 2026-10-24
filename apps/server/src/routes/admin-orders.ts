import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { COUNTRY_CODES, validatePricing, type DeliveryPricing } from "@yanabuy/shared";
import { and, asc, count, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { orders, shops, users } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { getDelivery, readyMethods, saveDelivery } from "../lib/delivery";
import { getDeliveryPricing, saveDeliveryPricing } from "../lib/delivery-pricing";
import { addEvent, buyer, loadOrder, moveOrder, summaries, withEarning } from "../lib/orders";
import { notify } from "../lib/notify";
import { LIVE_MINUTES, orderNumber, type AdminMap, type DeliverySettings, type RiderSummary } from "@yanabuy/shared";
import { getRiderRadius, saveRiderRadius } from "../lib/locations";
import { lastLocation } from "../lib/serialize";
import { gt, isNotNull } from "drizzle-orm";

/** Orders, rider assignment and delivery settings. Mounted under /api/admin. */
export const adminOrdersRouter = Router();

const PAGE = 25;
const ACTIVE = ["placed", "accepted", "ready", "picked_up"] as const;

const listSchema = z.object({
  view: z.enum(["all", "active", "need_rider", "placed", "accepted", "ready", "picked_up", "delivered", "cancelled"]).default("all"),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

adminOrdersRouter.get("/orders", async (req, res) => {
  const { view, q, page } = parse(listSchema, req.query);
  const filters: SQL[] = [];
  if (view === "active") filters.push(inArray(orders.status, [...ACTIVE]));
  else if (view === "need_rider") filters.push(and(inArray(orders.status, ["accepted", "ready"]), isNull(orders.riderId), eq(orders.fulfilment, "delivery"))!);
  else if (view !== "all") filters.push(eq(orders.status, view));
  if (q) {
    const digits = q.replace(/\D/g, "");
    filters.push(
      or(
        ilike(shops.name, `%${q}%`),
        ilike(orders.deliveryName, `%${q}%`),
        ilike(buyer.fullName, `%${q}%`),
        ...(digits ? [sql`${orders.number}::text like ${`%${digits}%`}`, ilike(orders.deliveryPhone, `%${digits.replace(/^0/, "")}%`)] : [])
      )!
    );
  }
  const where = filters.length ? and(...filters) : undefined;
  const [items, [total]] = await Promise.all([
    summaries(where, { limit: PAGE, offset: (page - 1) * PAGE, oldestFirst: view === "need_rider" || view === "active" }),
    db
      .select({ n: count() })
      .from(orders)
      .innerJoin(shops, eq(shops.id, orders.shopId))
      .innerJoin(buyer, eq(buyer.id, orders.buyerId))
      .where(where),
  ]);
  res.json({ items, total: total.n, page, pageSize: PAGE });
});

adminOrdersRouter.get("/orders/:id", async (req, res) => {
  res.json({ order: await withEarning((await loadOrder(req.params.id)).order) });
});

/** Give an order to a rider (or take it away). Allowed from accepted until it's delivered. */
adminOrdersRouter.post("/orders/:id/assign", async (req, res) => {
  const { riderId } = parse(z.object({ riderId: z.string().uuid().nullable() }), req.body);
  const { order } = await loadOrder(req.params.id);
  if (riderId && order.fulfilment !== "delivery") throw new HttpError(400, `This is ${order.fulfilment === "eat_in" ? "an eat-in" : "a pickup"} order — no rider needed`);
  if (!["accepted", "ready", "picked_up"].includes(order.status)) {
    throw new HttpError(400, order.status === "placed" ? "Wait for the shop to accept the order first" : "This order is finished — riders can't be changed");
  }
  let riderName: string | null = null;
  if (riderId) {
    const [r] = await db.select().from(users).where(eq(users.id, riderId)).limit(1);
    if (!r || r.role !== "rider") throw new HttpError(400, "That person isn't a rider");
    if (r.status !== "active") throw new HttpError(400, "That rider is blocked");
    riderName = r.fullName;
  }
  // An admin's choice replaces any request the shop sent that wasn't answered.
  await db.update(orders).set({ riderId, offeredRiderId: null, offeredAt: null, updatedAt: new Date() }).where(eq(orders.id, order.id));
  await addEvent(order.id, riderId ? "rider_assigned" : "rider_removed", req.user!.id, riderName);
  if (riderId) {
    notify([riderId], { type: "order", title: `New delivery ${order.number}`, body: `Pick up from ${order.shop.name}, deliver to ${order.delivery.city}`, link: "/rider" });
    notify([order.buyer.id], { type: "order", title: `${riderName} will deliver ${order.number}`, link: `/orders/${order.id}` });
  }
  await audit(req.user!.id, riderId ? "order.assign" : "order.unassign", { type: "order", id: order.id }, { number: order.number, rider: riderName ?? order.rider?.fullName ?? null });
  res.json({ order: await withEarning((await loadOrder(order.id)).order) });
});

adminOrdersRouter.post("/orders/:id/cancel", async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3, "Write a short reason — the buyer and shop see it").max(300) }), req.body);
  const { order } = await loadOrder(req.params.id);
  await moveOrder(order.id, ["placed", "accepted", "ready", "picked_up"], "cancelled", req.user!.id, { note: reason, cancelledBy: "admin" });
  await audit(req.user!.id, "order.cancel", { type: "order", id: order.id }, { number: order.number, reason });
  res.json({ order: await withEarning((await loadOrder(order.id)).order) });
});

/** Every rider with how busy they are, least busy first. */
adminOrdersRouter.get("/riders", async (_req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const active = sql<number>`(select count(*)::int from ${orders} o where o.rider_id = ${users.id} and o.status in ('accepted','ready','picked_up'))`;
  const today = sql<number>`(select count(*)::int from ${orders} o where o.rider_id = ${users.id} and o.status = 'delivered' and o.delivered_at >= ${startOfDay})`;
  const rows = await db
    .select({ id: users.id, fullName: users.fullName, phone: users.phone, avatarUrl: users.avatarUrl, status: users.status, active, today })
    .from(users)
    .where(eq(users.role, "rider"))
    .orderBy(asc(active), asc(users.fullName));
  const items: RiderSummary[] = rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    phone: r.phone,
    avatarUrl: r.avatarUrl,
    status: r.status,
    activeDeliveries: r.active,
    deliveredToday: r.today,
  }));
  res.json({ items });
});

adminOrdersRouter.get("/settings/delivery", async (_req, res) => {
  res.json({ delivery: await getDelivery(), ready: [...readyMethods()] });
});

const money = z.number().int().min(0).max(100_000_000);
const deliverySchema = z.object({
  fee: money,
  freeOver: money.nullable(),
  methods: z.object({ cod: z.boolean(), mtn_momo: z.boolean(), orange_money: z.boolean(), card: z.boolean() }),
  areas: z
    .array(
      z.object({
        id: z.string().max(40).optional(),
        name: z.string().trim().min(2, "Give every area a name").max(60, "Keep area names short"),
        fee: money,
        active: z.boolean().default(true),
        country: z.enum(COUNTRY_CODES).default("LR"),
      })
    )
    .max(120, "Up to 120 areas")
    .default([]),
  countryFees: z
    .object({ US: z.object({ fee: money, freeOver: money.nullable() }).optional() })
    .default({}),
});

adminOrdersRouter.put("/settings/delivery", async (req, res) => {
  const parsed = parse(deliverySchema, req.body);
  const names = new Set<string>();
  for (const a of parsed.areas) {
    const key = `${a.country}:${a.name.toLowerCase()}`;
    if (names.has(key)) throw new HttpError(400, `"${a.name}" is listed twice`, { areas: "Each area needs its own name" });
    names.add(key);
  }
  // Areas keep their id when renamed, so a buyer's saved area still works.
  const input: DeliverySettings = { ...parsed, areas: parsed.areas.map((a) => ({ ...a, id: a.id || randomUUID().slice(0, 12) })) };
  const on = (Object.keys(input.methods) as (keyof DeliverySettings["methods"])[]).filter((m) => input.methods[m]);
  if (!on.length) throw new HttpError(400, "Keep at least one way to pay switched on");
  const notReady = on.filter((m) => !readyMethods().has(m));
  if (notReady.length) throw new HttpError(400, "That way of paying isn't connected yet — its merchant keys must be added to the server settings first");
  const delivery = await saveDelivery(input, req.user!.id);
  await audit(req.user!.id, "settings.delivery", { type: "settings", id: "delivery" }, { fee: input.fee, freeOver: input.freeOver, areas: input.areas.length });
  res.json({ delivery });
});

// ─── Delivery fee by distance and weight, per country ───────────────────────
const num = z.number().finite();
const bandsSchema = z.array(z.object({ upTo: num, feeCents: z.number().int() })).max(30, "At most 30 bands");
const pricingSchema = z.object({
  mode: z.enum(["area", "distance"]),
  distance: z.object({
    unit: z.enum(["km", "mi"]),
    method: z.enum(["rate", "bands"]),
    baseCents: z.number().int(),
    included: num,
    rateCents: z.number().int(),
    bands: bandsSchema,
    roadFactor: num,
    maxDistance: num.nullable(),
  }),
  weight: z.object({
    enabled: z.boolean(),
    unit: z.enum(["kg", "lb"]),
    method: z.enum(["rate", "bands"]),
    included: num,
    rateCents: z.number().int(),
    bands: bandsSchema,
    maxWeight: num.nullable(),
    defaultItemWeight: num,
    applyToRestaurants: z.boolean(),
    heavyOver: num.nullable(),
  }),
  minFeeCents: z.number().int(),
  maxFeeCents: z.number().int().nullable(),
  roundToCents: z.number().int(),
});
const countryParam = z.enum(COUNTRY_CODES, { errorMap: () => ({ message: "Unknown country" }) });

adminOrdersRouter.get("/delivery-pricing/:country", async (req, res) => {
  const country = parse(countryParam, req.params.country);
  res.json({ pricing: await getDeliveryPricing(country) });
});

adminOrdersRouter.put("/delivery-pricing/:country", async (req, res) => {
  const country = parse(countryParam, req.params.country);
  const input: DeliveryPricing = parse(pricingSchema, req.body);
  const problems = validatePricing(input);
  if (problems.length) throw new HttpError(400, problems[0], { pricing: problems.join(" · ") });
  const before = await getDeliveryPricing(country);
  const pricing = await saveDeliveryPricing(country, input, req.user!.id);
  await audit(req.user!.id, "delivery_pricing.update", { type: "settings", id: `delivery_pricing:${country}` }, { country, before, after: pricing });
  res.json({ pricing });
});

export async function orderStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({
      today: sql<number>`count(*) filter (where ${orders.createdAt} >= ${startOfDay})::int`,
      active: sql<number>`count(*) filter (where ${orders.status} in ('placed','accepted','ready','picked_up'))::int`,
      needRider: sql<number>`count(*) filter (where ${orders.status} in ('accepted','ready') and ${orders.riderId} is null and ${orders.fulfilment} = 'delivery')::int`,
      deliveredToday: sql<number>`count(*) filter (where ${orders.status} = 'delivered' and ${orders.deliveredAt} >= ${startOfDay})::int`,
      salesToday: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'delivered' and ${orders.deliveredAt} >= ${startOfDay}), 0)::int`,
    })
    .from(orders);
  return row;
}

// ─── Live map ───────────────────────────────────────────────────────────────

/** Everyone with a spot on the map: shops, riders (online ones live), buyers' last spots and open orders' pins. */
adminOrdersRouter.get("/map", async (_req, res) => {
  const owner = users;
  const [shopRows, riderRows, buyerRows, orderRows, radiusKm] = await Promise.all([
    db
      .select({ s: shops, oLat: owner.lat, oLng: owner.lng })
      .from(shops)
      .innerJoin(owner, eq(owner.id, shops.ownerId))
      .where(inArray(shops.status, ["approved", "pending"]))
      .limit(2000),
    db
      .select({
        u: users,
        active: sql<number>`(select count(*)::int from ${orders} o where o.rider_id = ${users.id} and o.status in ('accepted','ready','picked_up'))`,
      })
      .from(users)
      .where(and(eq(users.role, "rider"), eq(users.status, "active"), isNull(users.deletedAt), isNotNull(users.lat)))
      .limit(2000),
    db
      .select()
      .from(users)
      .where(and(eq(users.role, "buyer"), isNull(users.deletedAt), isNotNull(users.lat), gt(users.locatedAt, new Date(Date.now() - 90 * 86400_000))))
      .limit(3000),
    db
      .select({ id: orders.id, number: orders.number, status: orders.status, lat: orders.deliveryLat, lng: orders.deliveryLng, shopName: shops.name })
      .from(orders)
      .innerJoin(shops, eq(shops.id, orders.shopId))
      .where(and(inArray(orders.status, [...ACTIVE]), isNotNull(orders.deliveryLat)))
      .limit(1000),
    getRiderRadius(),
  ]);
  const liveSince = Date.now() - LIVE_MINUTES * 60_000;
  const map: AdminMap = {
    shops: shopRows.flatMap(({ s, oLat, oLng }) => {
      const own = s.lat != null && s.lng != null;
      const lat = own ? s.lat : oLat;
      const lng = own ? s.lng : oLng;
      return lat != null && lng != null ? [{ id: s.id, name: s.name, slug: s.slug, kind: s.kind, city: s.city, status: s.status, location: { lat, lng }, fromOwner: !own }] : [];
    }),
    riders: riderRows.flatMap(({ u, active }) => {
      const location = lastLocation(u);
      if (!location) return [];
      return [{ id: u.id, fullName: u.fullName, phone: u.phone, avatarUrl: u.avatarUrl, online: u.riderOnline && new Date(location.at).getTime() > liveSince, location, activeDeliveries: active }];
    }),
    buyers: buyerRows.flatMap((u) => {
      const location = lastLocation(u);
      return location ? [{ id: u.id, fullName: u.fullName, phone: u.phone, avatarUrl: u.avatarUrl, location }] : [];
    }),
    orders: orderRows.flatMap((o) =>
      o.lat != null && o.lng != null ? [{ id: o.id, number: orderNumber(o.number ?? 0), status: o.status, location: { lat: o.lat, lng: o.lng }, shopName: o.shopName }] : []
    ),
    radiusKm,
  };
  res.json(map);
});

/** How far (km) a rider can be from a shop to show as "nearby". */
adminOrdersRouter.put("/rider-radius", async (req, res) => {
  const { radiusKm } = parse(z.object({ radiusKm: z.number().min(0.5, "At least 0.5 km").max(100, "100 km at most") }), req.body);
  await saveRiderRadius(radiusKm, req.user!.id);
  await audit(req.user!.id, "settings.rider_radius", { type: "settings", id: "rider_radius_km" }, { radiusKm });
  res.json({ radiusKm });
});
