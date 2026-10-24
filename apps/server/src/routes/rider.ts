import { Router } from "express";
import { z } from "zod";
import { and, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { orders, riderEntries, shops, users, type UserRow } from "../db/schema";
import type { MyRiderEarnings } from "@yanabuy/shared";
import { riderEntriesFor } from "./admin-owed";
import { HttpError, parse } from "../lib/http";
import { addEvent } from "../lib/orders";
import { notify } from "../lib/notify";
import { getRiderRadius, openJobsFor, saveLocation } from "../lib/locations";
import { userWithShop } from "../lib/serialize";
import { loadOrder, moveOrder, summaries } from "../lib/orders";
import { requireAuth, requireRole } from "../middleware/auth";
import { recordSale, riderBalance } from "../lib/finance";

/** A rider's deliveries: ones they accepted (or an admin gave them) and requests from shops waiting for an answer. */
export const riderRouter = Router();
riderRouter.use(requireAuth, requireRole("rider"));

riderRouter.get("/orders", async (req, res) => {
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  res.json({
    items: await summaries(
      or(
        and(
          eq(orders.riderId, req.user!.id),
          or(inArray(orders.status, ["accepted", "ready", "picked_up"]), and(inArray(orders.status, ["delivered", "cancelled"]), gte(orders.updatedAt, since)))
        ),
        and(eq(orders.offeredRiderId, req.user!.id), isNull(orders.riderId), inArray(orders.status, ["accepted", "ready"]))
      ),
      { limit: 100, oldestFirst: true }
    ),
  });
});

const mine = (riderId: string, id: string) => loadOrder(id, eq(orders.riderId, riderId));
/** Their own deliveries, requests sent to them, and packed orders near them that nobody has taken. */
async function visible(rider: UserRow, id: string) {
  try {
    return await loadOrder(id, or(eq(orders.riderId, rider.id), eq(orders.offeredRiderId, rider.id)));
  } catch (err) {
    if (!(err instanceof HttpError) || err.status !== 404) throw err;
    if (!(await openJobsFor(rider)).some((j) => j.id === id)) throw err;
    return loadOrder(id);
  }
}

/** Packed orders near this rider that nobody has taken yet — first to accept gets it. */
riderRouter.get("/open", async (req, res) => {
  const jobs = await openJobsFor(req.user!);
  const radiusKm = await getRiderRadius();
  if (!jobs.length) return res.json({ items: [], radiusKm });
  const list = await summaries(inArray(orders.id, jobs.map((j) => j.id)), { limit: 50, oldestFirst: true });
  const items = jobs.flatMap((j) => {
    const o = list.find((x) => x.id === j.id);
    return o ? [{ ...o, distanceKm: j.distanceKm }] : [];
  });
  res.json({ items, radiusKm });
});

/** Online = shops near them can send delivery requests. While online the app sends their GPS spot about every 30 s. */
riderRouter.post("/online", async (req, res) => {
  const { online, lat, lng } = parse(
    z.object({ online: z.boolean(), lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional() }),
    req.body
  );
  if (online && lat != null && lng != null) await saveLocation(req.user!.id, { lat, lng });
  const [u] = await db.update(users).set({ riderOnline: online, updatedAt: new Date() }).where(eq(users.id, req.user!.id)).returning();
  res.json({ user: await userWithShop(u) });
});

/** Say yes to a shop's request, or take a packed order near them (first to accept gets it). */
riderRouter.post("/orders/:id/accept", async (req, res) => {
  const me = req.user!;
  const { row, order } = await visible(me, req.params.id);
  const askedMe = row.order.offeredRiderId === me.id;
  const otherAsked = !askedMe ? row.order.offeredRiderId : null;
  const [taken] = await db
    .update(orders)
    .set({ riderId: me.id, offeredRiderId: null, offeredAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(orders.id, order.id),
        isNull(orders.riderId),
        eq(orders.fulfilment, "delivery"),
        askedMe ? and(eq(orders.offeredRiderId, me.id), inArray(orders.status, ["accepted", "ready"])) : eq(orders.status, "ready")
      )
    )
    .returning({ id: orders.id });
  if (!taken) throw new HttpError(409, "Another rider took this one, or the shop changed it. Check your list for others.");
  if (otherAsked) notify([otherAsked], { type: "order", title: `${order.number} was taken by another rider`, body: "No need to answer that request.", link: "/rider" });
  await addEvent(order.id, "rider_assigned", me.id, me.fullName);
  const [s] = await db.select({ ownerId: shops.ownerId }).from(shops).where(eq(shops.id, order.shop.id)).limit(1);
  if (s) notify([s.ownerId], { type: "order", title: `${me.fullName} accepted ${order.number}`, body: "They're coming to pick it up.", link: "/sell/orders" });
  notify([order.buyer.id], { type: "order", title: `${me.fullName} will deliver ${order.number}`, link: `/orders/${order.id}` });
  res.json({ order: (await loadOrder(order.id)).order });
});

/** Say no (busy, too far…). The shop is told so it can ask another rider. */
riderRouter.post("/orders/:id/decline", async (req, res) => {
  const me = req.user!;
  const { reason } = parse(z.object({ reason: z.string().trim().max(200).optional() }), req.body ?? {});
  const { row, order } = await visible(me, req.params.id);
  // A packed order near them that nobody asked them about: just hide it from their list.
  if (row.order.offeredRiderId !== me.id) {
    await db
      .update(orders)
      .set({ declinedRiderIds: sql`(select jsonb_agg(distinct x) from jsonb_array_elements_text(${orders.declinedRiderIds} || ${JSON.stringify([me.id])}::jsonb) as t(x))` })
      .where(and(eq(orders.id, order.id), isNull(orders.riderId)));
    return res.json({ ok: true });
  }
  const [done] = await db
    .update(orders)
    .set({
      offeredRiderId: null,
      offeredAt: null,
      declinedRiderIds: sql`(select jsonb_agg(distinct x) from jsonb_array_elements_text(${orders.declinedRiderIds} || ${JSON.stringify([me.id])}::jsonb) as t(x))`,
      updatedAt: new Date(),
    })
    .where(and(eq(orders.id, order.id), eq(orders.offeredRiderId, me.id), isNull(orders.riderId)))
    .returning({ id: orders.id });
  if (!done) throw new HttpError(409, "This request isn't open any more");
  await addEvent(order.id, "rider_declined", me.id, reason ? `${me.fullName}: ${reason}` : me.fullName);
  const [s] = await db.select({ ownerId: shops.ownerId }).from(shops).where(eq(shops.id, order.shop.id)).limit(1);
  if (s) notify([s.ownerId], { type: "order", title: `${me.fullName} can't take ${order.number}`, body: "Pick another rider.", link: "/sell/orders" });
  res.json({ ok: true });
});

riderRouter.get("/orders/:id", async (req, res) => {
  res.json({ order: (await visible(req.user!, req.params.id)).order });
});

riderRouter.post("/orders/:id/picked-up", async (req, res) => {
  await mine(req.user!.id, req.params.id);
  await moveOrder(req.params.id, ["ready"], "picked_up", req.user!.id);
  res.json({ order: (await loadOrder(req.params.id)).order });
});

/** Delivered. For cash on delivery the rider confirms the cash was collected — that marks it paid. */
riderRouter.post("/orders/:id/delivered", async (req, res) => {
  const { cashCollected } = parse(z.object({ cashCollected: z.boolean().default(false) }), req.body ?? {});
  const { order } = await mine(req.user!.id, req.params.id);
  if (order.paymentMethod === "cod" && !cashCollected) {
    return res.status(400).json({ error: "Collect the cash first, then confirm it", fields: { cashCollected: "Confirm the cash" } });
  }
  const paid = order.paymentMethod === "cod" ? { paymentStatus: "paid" as const, paidAt: new Date() } : {};
  await moveOrder(req.params.id, ["picked_up"], "delivered", req.user!.id, {
    note: order.paymentMethod === "cod" ? "Cash collected" : null,
    extra: paid,
  });
  // The shop earns its share now.
  await recordSale(req.params.id);
  res.json({ order: (await loadOrder(req.params.id)).order });
});

/** The rider's delivery pay: the full delivery fee of each delivered trip, and what YanaBuy has sent them. */
riderRouter.get("/earnings", async (req, res) => {
  const id = req.user!.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [owed, entries, [t]] = await Promise.all([
    riderBalance(id),
    riderEntriesFor(id, 50),
    db
      .select({ trips: sql<number>`count(*)::int`, earned: sql<number>`coalesce(sum(${riderEntries.amount}), 0)::int` })
      .from(riderEntries)
      .where(and(eq(riderEntries.riderId, id), eq(riderEntries.type, "trip"), gte(riderEntries.createdAt, today))),
  ]);
  const out: MyRiderEarnings = { owed, today: { trips: t.trips, earned: t.earned }, entries };
  res.json({ earnings: out });
});

/** Cash the rider collected and still has to hand in to YanaBuy. */
riderRouter.get("/cash", async (req, res) => {
  const rows = await db
    .select({ total: orders.total })
    .from(orders)
    .where(and(eq(orders.riderId, req.user!.id), eq(orders.status, "delivered"), eq(orders.paymentMethod, "cod"), isNull(orders.cashHandedInAt)));
  res.json({ amount: rows.reduce((n, o) => n + o.total, 0), orders: rows.length });
});
