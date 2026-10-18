import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { disputes, orders, shops } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { addEvent, loadOrder, moveOrder, summaries } from "../lib/orders";
import { requireAuth } from "../middleware/auth";

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
  res.json({ order: (await mine(req, req.params.id)).order });
});

shopOrdersRouter.post("/:id/accept", async (req, res) => {
  await mine(req, req.params.id);
  await moveOrder(req.params.id, ["placed"], "accepted", req.user!.id);
  res.json({ order: (await loadOrder(req.params.id)).order });
});

shopOrdersRouter.post("/:id/ready", async (req, res) => {
  await mine(req, req.params.id);
  await moveOrder(req.params.id, ["accepted"], "ready", req.user!.id);
  res.json({ order: (await loadOrder(req.params.id)).order });
});

const reasonSchema = z.object({
  reason: z.string().trim().min(3, "Tell the buyer why, in a few words").max(300, "Keep the reason short"),
});

/** Sellers can turn an order down until it's packed and ready. */
shopOrdersRouter.post("/:id/reject", async (req, res) => {
  const { reason } = parse(reasonSchema, req.body);
  await mine(req, req.params.id);
  await moveOrder(req.params.id, ["placed", "accepted"], "cancelled", req.user!.id, { note: reason, cancelledBy: "seller" });
  res.json({ order: (await loadOrder(req.params.id)).order });
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
  res.json({ order: (await loadOrder(row.order.id)).order });
});
