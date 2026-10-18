import { Router } from "express";
import { z } from "zod";
import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db/client";
import { orders } from "../db/schema";
import { parse } from "../lib/http";
import { loadOrder, moveOrder, summaries } from "../lib/orders";
import { requireAuth, requireRole } from "../middleware/auth";
import { recordSale } from "../lib/finance";

/** A rider's deliveries. Riders only see orders an admin gave them. */
export const riderRouter = Router();
riderRouter.use(requireAuth, requireRole("rider"));

riderRouter.get("/orders", async (req, res) => {
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  res.json({
    items: await summaries(
      and(
        eq(orders.riderId, req.user!.id),
        or(inArray(orders.status, ["accepted", "ready", "picked_up"]), and(inArray(orders.status, ["delivered", "cancelled"]), gte(orders.updatedAt, since)))
      ),
      { limit: 100, oldestFirst: true }
    ),
  });
});

const mine = (riderId: string, id: string) => loadOrder(id, eq(orders.riderId, riderId));

riderRouter.get("/orders/:id", async (req, res) => {
  res.json({ order: (await mine(req.user!.id, req.params.id)).order });
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

/** Cash the rider collected and still has to hand in to YanaBuy. */
riderRouter.get("/cash", async (req, res) => {
  const rows = await db
    .select({ total: orders.total })
    .from(orders)
    .where(and(eq(orders.riderId, req.user!.id), eq(orders.status, "delivered"), eq(orders.paymentMethod, "cod"), isNull(orders.cashHandedInAt)));
  res.json({ amount: rows.reduce((n, o) => n + o.total, 0), orders: rows.length });
});
