import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { COUNTRY_CODES } from "@yanabuy/shared";
import { and, asc, count, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { orders, shops, users } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { getDelivery, readyMethods, saveDelivery } from "../lib/delivery";
import { addEvent, buyer, loadOrder, moveOrder, summaries } from "../lib/orders";
import { notify } from "../lib/notify";
import type { DeliverySettings, RiderSummary } from "@yanabuy/shared";

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
  else if (view === "need_rider") filters.push(and(inArray(orders.status, ["accepted", "ready"]), isNull(orders.riderId))!);
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
  res.json({ order: (await loadOrder(req.params.id)).order });
});

/** Give an order to a rider (or take it away). Allowed from accepted until it's delivered. */
adminOrdersRouter.post("/orders/:id/assign", async (req, res) => {
  const { riderId } = parse(z.object({ riderId: z.string().uuid().nullable() }), req.body);
  const { order } = await loadOrder(req.params.id);
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
  await db.update(orders).set({ riderId, updatedAt: new Date() }).where(eq(orders.id, order.id));
  await addEvent(order.id, riderId ? "rider_assigned" : "rider_removed", req.user!.id, riderName);
  if (riderId) {
    notify([riderId], { type: "order", title: `New delivery ${order.number}`, body: `Pick up from ${order.shop.name}, deliver to ${order.delivery.city}`, link: "/rider" });
    notify([order.buyer.id], { type: "order", title: `${riderName} will deliver ${order.number}`, link: `/orders/${order.id}` });
  }
  await audit(req.user!.id, riderId ? "order.assign" : "order.unassign", { type: "order", id: order.id }, { number: order.number, rider: riderName ?? order.rider?.fullName ?? null });
  res.json({ order: (await loadOrder(order.id)).order });
});

adminOrdersRouter.post("/orders/:id/cancel", async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3, "Write a short reason — the buyer and shop see it").max(300) }), req.body);
  const { order } = await loadOrder(req.params.id);
  await moveOrder(order.id, ["placed", "accepted", "ready", "picked_up"], "cancelled", req.user!.id, { note: reason, cancelledBy: "admin" });
  await audit(req.user!.id, "order.cancel", { type: "order", id: order.id }, { number: order.number, reason });
  res.json({ order: (await loadOrder(order.id)).order });
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

export async function orderStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({
      today: sql<number>`count(*) filter (where ${orders.createdAt} >= ${startOfDay})::int`,
      active: sql<number>`count(*) filter (where ${orders.status} in ('placed','accepted','ready','picked_up'))::int`,
      needRider: sql<number>`count(*) filter (where ${orders.status} in ('accepted','ready') and ${orders.riderId} is null)::int`,
      deliveredToday: sql<number>`count(*) filter (where ${orders.status} = 'delivered' and ${orders.deliveredAt} >= ${startOfDay})::int`,
      salesToday: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'delivered' and ${orders.deliveredAt} >= ${startOfDay}), 0)::int`,
    })
    .from(orders);
  return row;
}

