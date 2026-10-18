import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { MoneyOverview, RiderCash, ShopBalance } from "@yanabuy/shared";
import { orderNumber } from "@yanabuy/shared";
import { db } from "../db/client";
import { orders, payouts, shops, users, walletEntries } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { getFinance, saveFinance, shopBalance } from "../lib/finance";
import { notify } from "../lib/notify";
import { payoutOut, startOfMonth, walletEntriesFor } from "../lib/wallet";

/** Money: overview, commission, payouts, seller balances, cash from riders. Mounted under /api/admin. */
export const adminMoneyRouter = Router();
const usd = (c: number) => `$${(c / 100).toFixed(2).replace(/\.00$/, "")}`;


adminMoneyRouter.get("/money", async (_req, res) => {
  const month = startOfMonth();
  const [m] = await db
    .select({
      sales: sql<number>`coalesce(sum(${orders.subtotal}), 0)::int`,
      commission: sql<number>`coalesce(sum(${orders.commission}), 0)::int`,
      fees: sql<number>`coalesce(sum(${orders.deliveryFee}), 0)::int`,
      discounts: sql<number>`coalesce(sum(${orders.discount}), 0)::int`,
    })
    .from(orders)
    .where(and(eq(orders.status, "delivered"), gte(orders.deliveredAt, month)));
  const [owed] = await db.select({ n: sql<number>`coalesce(sum(${walletEntries.amount}), 0)::int` }).from(walletEntries);
  const [cash] = await db
    .select({ n: sql<number>`coalesce(sum(${orders.total}), 0)::int` })
    .from(orders)
    .where(and(eq(orders.status, "delivered"), eq(orders.paymentMethod, "cod"), isNull(orders.cashHandedInAt)));
  const [waiting] = await db
    .select({ count: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(${payouts.amount}), 0)::int` })
    .from(payouts)
    .where(eq(payouts.status, "requested"));
  const [paid] = await db
    .select({ n: sql<number>`coalesce(sum(${payouts.amount}), 0)::int` })
    .from(payouts)
    .where(and(eq(payouts.status, "paid"), gte(payouts.reviewedAt, month)));
  const overview: MoneyOverview = {
    salesThisMonth: m.sales,
    commissionThisMonth: m.commission,
    deliveryFeesThisMonth: m.fees,
    discountsThisMonth: m.discounts,
    // Requested payouts are already taken off balances but not yet sent.
    owedToSellers: owed.n + waiting.amount,
    cashWithRiders: cash.n,
    payoutsWaiting: waiting,
    paidOutThisMonth: paid.n,
  };
  res.json({ overview });
});

adminMoneyRouter.get("/settings/finance", async (_req, res) => {
  res.json({ finance: await getFinance() });
});

const pct = z.number().min(0, "Can't be below 0%").max(50, "That's more than 50%");
adminMoneyRouter.put("/settings/finance", async (req, res) => {
  const input = parse(z.object({ goodsCommission: pct, foodCommission: pct, minPayout: z.number().int().min(0).max(100_000_000) }), req.body);
  const finance = await saveFinance(input, req.user!.id);
  await audit(req.user!.id, "settings.finance", { type: "settings", id: "finance" }, input);
  res.json({ finance });
});

// ─── Payouts ───────────────────────────────────────────────────────────────

adminMoneyRouter.get("/payouts", async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(["requested", "paid", "rejected", "all"]).default("requested") }), req.query);
  const rows = await db
    .select({ p: payouts, shop: shops })
    .from(payouts)
    .innerJoin(shops, eq(shops.id, payouts.shopId))
    .where(status === "all" ? undefined : eq(payouts.status, status))
    .orderBy(status === "requested" ? asc(payouts.createdAt) : desc(payouts.createdAt))
    .limit(100);
  res.json({ items: rows.map((r) => payoutOut(r.p, r.shop)) });
});

async function loadPayout(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Payout not found");
  const [row] = await db.select({ p: payouts, shop: shops }).from(payouts).innerJoin(shops, eq(shops.id, payouts.shopId)).where(eq(payouts.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Payout not found");
  if (row.p.status !== "requested") throw new HttpError(409, "This payout was already handled. Reload to see the latest.");
  return row;
}

/** After sending the money by mobile money, the admin records the transaction ID. */
adminMoneyRouter.post("/payouts/:id/paid", async (req, res) => {
  const { reference } = parse(z.object({ reference: z.string().trim().min(3, "Enter the mobile money transaction ID").max(80) }), req.body);
  const row = await loadPayout(req.params.id);
  const [p] = await db
    .update(payouts)
    .set({ status: "paid", reference, reviewedAt: new Date(), reviewedById: req.user!.id })
    .where(and(eq(payouts.id, row.p.id), eq(payouts.status, "requested")))
    .returning();
  if (!p) throw new HttpError(409, "This payout was already handled");
  await audit(req.user!.id, "payout.paid", { type: "payout", id: p.id }, { shop: row.shop.name, amount: p.amount, reference });
  notify([row.shop.ownerId], { type: "payout", title: `${usd(p.amount)} sent to your mobile money`, body: `Transaction ID ${reference}`, link: "/sell/earnings" });
  res.json({ payout: payoutOut(p, row.shop) });
});

adminMoneyRouter.post("/payouts/:id/reject", async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3, "Write a short reason — the seller sees it").max(300) }), req.body);
  const row = await loadPayout(req.params.id);
  const p = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(payouts)
      .set({ status: "rejected", reason, reviewedAt: new Date(), reviewedById: req.user!.id })
      .where(and(eq(payouts.id, row.p.id), eq(payouts.status, "requested")))
      .returning();
    if (!updated) throw new HttpError(409, "This payout was already handled");
    // The money goes back into the seller's balance.
    await tx.insert(walletEntries).values({ shopId: row.shop.id, type: "payout_returned", amount: updated.amount, payoutId: updated.id, note: reason, byUserId: req.user!.id });
    return updated;
  });
  await audit(req.user!.id, "payout.reject", { type: "payout", id: p.id }, { shop: row.shop.name, amount: p.amount, reason });
  notify([row.shop.ownerId], { type: "payout", title: `Payout of ${usd(p.amount)} not sent — it's back in your balance`, body: reason, link: "/sell/earnings" });
  res.json({ payout: payoutOut(p, row.shop) });
});

// ─── Seller balances ───────────────────────────────────────────────────────

adminMoneyRouter.get("/balances", async (_req, res) => {
  const bal = sql<number>`coalesce((select sum(w.amount) from ${walletEntries} w where w.shop_id = ${shops.id}), 0)::int`;
  const rows = await db
    .select({ shop: shops, owner: users.fullName, balance: bal })
    .from(shops)
    .innerJoin(users, eq(users.id, shops.ownerId))
    .where(inArray(shops.status, ["approved", "suspended"]))
    .orderBy(desc(bal), asc(shops.name));
  const items: ShopBalance[] = rows.map((r) => ({
    shop: { id: r.shop.id, name: r.shop.name, slug: r.shop.slug, kind: r.shop.kind, city: r.shop.city, logoUrl: r.shop.logoUrl, country: r.shop.country },
    balance: r.balance,
    owner: r.owner,
  }));
  res.json({ items });
});

adminMoneyRouter.get("/shops/:id/wallet", async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) throw new HttpError(404, "Shop not found");
  res.json({ balance: await shopBalance(req.params.id), entries: await walletEntriesFor(req.params.id) });
});

/** A manual correction (refund, bonus, mistake) — always with a note, always in the audit log. */
adminMoneyRouter.post("/shops/:id/adjust", async (req, res) => {
  const { amount, note } = parse(
    z.object({
      amount: z.number().int().refine((n) => n !== 0, "Enter an amount (use minus to take money off)"),
      note: z.string().trim().min(3, "Say why — the seller sees this").max(200),
    }),
    req.body
  );
  if (!z.string().uuid().safeParse(req.params.id).success) throw new HttpError(404, "Shop not found");
  const [shop] = await db.select().from(shops).where(eq(shops.id, req.params.id)).limit(1);
  if (!shop) throw new HttpError(404, "Shop not found");
  await db.insert(walletEntries).values({ shopId: shop.id, type: "adjustment", amount, note, byUserId: req.user!.id });
  await audit(req.user!.id, "wallet.adjust", { type: "shop", id: shop.id }, { shop: shop.name, amount, note });
  res.json({ balance: await shopBalance(shop.id), entries: await walletEntriesFor(shop.id) });
});

// ─── Cash from riders ──────────────────────────────────────────────────────

/** Cash-on-delivery money riders have collected and not handed in yet, per rider. */
adminMoneyRouter.get("/rider-cash", async (_req, res) => {
  const rows = await db
    .select({ o: orders, r: { id: users.id, fullName: users.fullName, phone: users.phone, avatarUrl: users.avatarUrl } })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.riderId))
    .where(and(eq(orders.status, "delivered"), eq(orders.paymentMethod, "cod"), isNull(orders.cashHandedInAt)))
    .orderBy(asc(orders.deliveredAt));
  const map = new Map<string, RiderCash>();
  for (const { o, r } of rows) {
    const entry = map.get(r.id) ?? { rider: r, amount: 0, orders: [] };
    entry.amount += o.total;
    entry.orders.push({ id: o.id, number: orderNumber(o.number ?? 0), total: o.total, deliveredAt: o.deliveredAt!.toISOString() });
    map.set(r.id, entry);
  }
  res.json({ items: [...map.values()].sort((a, b) => b.amount - a.amount) });
});

/** The rider handed the cash in. Only the orders listed (what the admin saw) are marked. */
adminMoneyRouter.post("/rider-cash/:riderId/received", async (req, res) => {
  const { orderIds } = parse(z.object({ orderIds: z.array(z.string().uuid()).min(1) }), req.body);
  const done = await db
    .update(orders)
    .set({ cashHandedInAt: new Date(), cashReceivedById: req.user!.id })
    .where(
      and(
        inArray(orders.id, orderIds),
        eq(orders.riderId, req.params.riderId),
        eq(orders.status, "delivered"),
        eq(orders.paymentMethod, "cod"),
        isNull(orders.cashHandedInAt)
      )
    )
    .returning({ total: orders.total });
  const amount = done.reduce((n, o) => n + o.total, 0);
  const [rider] = await db.select({ name: users.fullName }).from(users).where(eq(users.id, req.params.riderId));
  await audit(req.user!.id, "cash.received", { type: "user", id: req.params.riderId }, { rider: rider?.name ?? "rider", amount, orders: done.length });
  res.json({ received: amount, orders: done.length });
});
