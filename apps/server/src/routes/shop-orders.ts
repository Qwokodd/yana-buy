import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { disputes, orders, shops } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { addEvent, forSeller, loadOrder, moveOrder, summaries } from "../lib/orders";
import { recordSale } from "../lib/finance";
import { requireAuth } from "../middleware/auth";
import { broadcastPickup, getRiderRadius, isHeavy, onlineRiders, shopPoint } from "../lib/locations";
import { notify } from "../lib/notify";
import { orderNumber } from "@yanabuy/shared";

/** A seller's incoming orders. Mounted at /api/shop/orders. */
export const shopOrdersRouter = Router();
shopOrdersRouter.use(requireAuth);

async function myShopId(userId: string) {
  const [shop] = await db.select({ id: shops.id, status: shops.status }).from(shops).where(eq(shops.ownerId, userId)).limit(1);
  if (!shop) throw new HttpError(404, "Open a shop first");
  return shop.id;
}

const ACTIVE = ["placed", "accepted", "ready", "picked_up"] as const;
const DONE = ["delivered", "cancelled"] as const;

shopOrdersRouter.get("/", async (req, res) => {
  const { view } = parse(z.object({ view: z.enum(["active", "done"]).default("active") }), req.query);
  const shopId = await myShopId(req.user!.id);
  // A delivered order with an open problem stays on the to-do list until YanaBuy decides it.
  const openProblem = sql`exists (select 1 from ${disputes} where ${disputes.orderId} = ${orders.id} and ${disputes.status} = 'open')`;
  const where =
    view === "active"
      ? and(eq(orders.shopId, shopId), or(inArray(orders.status, [...ACTIVE]), openProblem))
      : and(eq(orders.shopId, shopId), inArray(orders.status, [...DONE]));
  res.json({ items: await summaries(where, { limit: 100, oldestFirst: view === "active" }) });
});

async function mine(req: { user?: { id: string } }, id: string) {
  const shopId = await myShopId(req.user!.id);
  return loadOrder(id, eq(orders.shopId, shopId));
}

shopOrdersRouter.get("/:id", async (req, res) => {
  res.json({ order: await forSeller((await mine(req, req.params.id)).order) });
});

shopOrdersRouter.post("/:id/accept", async (req, res) => {
  await mine(req, req.params.id);
  await moveOrder(req.params.id, ["placed"], "accepted", req.user!.id);
  res.json({ order: await forSeller((await loadOrder(req.params.id)).order) });
});

shopOrdersRouter.post("/:id/ready", async (req, res) => {
  const { order } = await mine(req, req.params.id);
  await moveOrder(req.params.id, ["accepted"], "ready", req.user!.id);
  // Eat in / pickup: no rider needed.
  if (order.fulfilment !== "delivery") return res.json({ order: await forSeller((await loadOrder(req.params.id)).order), ridersTold: 0 });
  // No rider yet: every online rider nearby hears about it; the first to accept gets it.
  const told = await broadcastPickup(req.params.id);
  if (told) await addEvent(req.params.id, "rider_broadcast", req.user!.id, `${told} ${told === 1 ? "rider" : "riders"} nearby`);
  res.json({ order: await forSeller((await loadOrder(req.params.id)).order), ridersTold: told });
});

/**
 * Eat in: the food was served. Pickup: the buyer collected it. That finishes the order.
 * Paid at the restaurant: the shop confirms it took the money (it keeps it; YanaBuy's commission comes off its balance).
 */
shopOrdersRouter.post("/:id/handed-over", async (req, res) => {
  const { cashCollected } = parse(z.object({ cashCollected: z.boolean().default(false) }), req.body ?? {});
  const { order } = await mine(req, req.params.id);
  if (order.fulfilment === "delivery") throw new HttpError(400, "A rider finishes delivery orders");
  if (order.paymentMethod === "cod" && !cashCollected) {
    throw new HttpError(400, "Take the payment first, then confirm it", { cashCollected: "Confirm the payment" });
  }
  const paid = order.paymentMethod === "cod" ? { paymentStatus: "paid" as const, paidAt: new Date(), cashHandedInAt: new Date() } : {};
  await moveOrder(req.params.id, ["accepted", "ready"], "delivered", req.user!.id, {
    note: `${order.fulfilment === "eat_in" ? "Served" : "Collected"}${order.paymentMethod === "cod" ? " · paid at the restaurant" : ""}`,
    extra: paid,
  });
  await recordSale(req.params.id);
  res.json({ order: await forSeller((await loadOrder(req.params.id)).order) });
});

const reasonSchema = z.object({
  reason: z.string().trim().min(3, "Tell the buyer why, in a few words").max(300, "Keep the reason short"),
});

/** Sellers can cancel an order until a rider has picked it up. */
shopOrdersRouter.post("/:id/reject", async (req, res) => {
  const { reason } = parse(reasonSchema, req.body);
  const { row } = await mine(req, req.params.id);
  const asked = row.order.offeredRiderId;
  await moveOrder(req.params.id, ["placed", "accepted", "ready"], "cancelled", req.user!.id, {
    note: reason,
    cancelledBy: "seller",
    extra: { offeredRiderId: null, offeredAt: null },
  });
  if (asked) notify([asked], { type: "order", title: `${orderNumber(row.order.number ?? 0)} was cancelled`, body: "No need to answer that request.", link: "/rider" });
  res.json({ order: await forSeller((await loadOrder(req.params.id)).order) });
});

/** The seller's side of a problem the buyer reported. Can be changed until an admin decides. */
shopOrdersRouter.post("/:id/dispute-response", async (req, res) => {
  const { response } = parse(
    z.object({ response: z.string({ required_error: "Write your side" }).trim().min(5, "Write your side in a few words").max(1000, "Keep it under 1000 characters") }),
    req.body
  );
  const { row } = await mine(req, req.params.id);
  const [d] = await db.select().from(disputes).where(eq(disputes.orderId, row.order.id)).limit(1);
  if (!d) throw new HttpError(404, "There's no problem reported on this order");
  if (d.status !== "open") throw new HttpError(409, "YanaBuy has already decided this one");
  await db.update(disputes).set({ sellerResponse: response, sellerRespondedAt: new Date() }).where(eq(disputes.id, d.id));
  if (!d.sellerResponse) await addEvent(row.order.id, "dispute_response", req.user!.id, null);
  res.json({ order: await forSeller((await loadOrder(row.order.id)).order) });
});

// ─── Riders: the shop picks an online rider near it; the rider accepts or declines ───

const OFFERABLE = ["accepted", "ready"] as const;

/** Online riders near the shop, nearest first. */
shopOrdersRouter.get("/:id/riders", async (req, res) => {
  const { row } = await mine(req, req.params.id);
  if (row.order.fulfilment !== "delivery") return res.json({ riders: [], radiusKm: 0, shopLocation: null, heavy: false });
  const from = await shopPoint(row.shop);
  const radiusKm = await getRiderRadius();
  const heavy = isHeavy(row.order);
  const riders = from ? await onlineRiders(from, { radiusKm, declined: row.order.declinedRiderIds, heavy }) : [];
  res.json({ riders, radiusKm, shopLocation: from, heavy });
});

/** Ask one rider to deliver this order. They get a notification and accept or decline in the app. */
shopOrdersRouter.post("/:id/offer", async (req, res) => {
  const { riderId } = parse(z.object({ riderId: z.string().uuid() }), req.body);
  const { row, order } = await mine(req, req.params.id);
  if (order.fulfilment !== "delivery") throw new HttpError(400, "This order isn't for delivery — the buyer comes to you");
  if (!(OFFERABLE as readonly string[]).includes(order.status)) {
    throw new HttpError(400, order.status === "placed" ? "Accept the order first, then pick a rider" : "Riders can't be changed on this order any more");
  }
  if (row.order.riderId) throw new HttpError(409, `${order.rider?.fullName ?? "A rider"} is already delivering this order`);
  const from = await shopPoint(row.shop);
  if (!from) throw new HttpError(400, "Set your shop's location first so we can find riders near you");
  const radiusKm = await getRiderRadius();
  const near = await onlineRiders(from, { radiusKm, heavy: isHeavy(row.order) });
  const pick = near.find((r) => r.id === riderId);
  if (!pick) throw new HttpError(400, "That rider isn't online near your shop any more — pick another one");
  if (!pick.canCarry) throw new HttpError(400, "This order is too heavy for a motorbike or bicycle — ask a rider with a keke or car");
  const now = new Date();
  const [updated] = await db
    .update(orders)
    .set({ offeredRiderId: riderId, offeredAt: now, updatedAt: now })
    .where(and(eq(orders.id, order.id), sql`${orders.riderId} is null`))
    .returning({ id: orders.id });
  if (!updated) throw new HttpError(409, "A rider was just given this order — reload to see the latest");
  await addEvent(order.id, "rider_offered", req.user!.id, pick.fullName);
  notify([riderId], {
    type: "order",
    title: `Delivery request ${order.number}`,
    body: `${order.shop.name} → ${order.delivery.city}. Accept or decline in the app.`,
    link: "/rider",
  });
  res.json({ order: await forSeller((await loadOrder(order.id)).order) });
});

/** Take back a request the rider hasn't answered, to ask someone else. */
shopOrdersRouter.post("/:id/cancel-offer", async (req, res) => {
  const { row, order } = await mine(req, req.params.id);
  if (!row.order.offeredRiderId) return res.json({ order: await forSeller(order) });
  const riderId = row.order.offeredRiderId;
  await db.update(orders).set({ offeredRiderId: null, offeredAt: null, updatedAt: new Date() }).where(eq(orders.id, order.id));
  await addEvent(order.id, "rider_offer_cancelled", req.user!.id, order.offer?.rider.fullName ?? null);
  notify([riderId], { type: "order", title: `${order.number} was given to someone else`, body: "No need to answer that request.", link: "/rider" });
  res.json({ order: await forSeller((await loadOrder(order.id)).order) });
});
