import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { orderNumber, type PayoutSchedule, type RiderEarningEntry, type RiderEarnings, type ShopBalance } from "@yanabuy/shared";
import { db } from "../db/client";
import { orders, payouts, riderEntries, shops, users, walletEntries } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { riderBalance, shopBalance } from "../lib/finance";
import { notify } from "../lib/notify";
import { payoutOut } from "../lib/wallet";
import { getFinance } from "../lib/finance";
import { env } from "../env";
import { disbursementConfigured } from "../lib/payments/mtn-disbursement";
import { sendRiderPayout, sendShopPayout } from "../lib/payments/transfers";

/**
 * Who YanaBuy owes: each shop / restaurant (their own prices for delivered orders, minus what was paid)
 * and each rider (the full delivery fee of every delivered trip, minus what was paid).
 * The admin sends the mobile money, then records the transaction ID here. Mounted under /api/admin.
 */
export const adminOwedRouter = Router();
const usd = (c: number) => `$${(c / 100).toFixed(2).replace(/\.00$/, "")}`;

const periodSchema = z.object({ period: z.enum(["today", "week", "month", "all"]).default("month") });
type Period = z.infer<typeof periodSchema>["period"];

function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function since(period: Period): Date {
  const today = startOfToday();
  if (period === "today") return today;
  if (period === "week") return new Date(today.getTime() - 6 * 86400_000);
  if (period === "month") return new Date(today.getFullYear(), today.getMonth(), 1);
  return new Date(0);
}

/** Is a payment due by the shop's schedule? (Always, if the shop asked for one.) */
function isDue(schedule: PayoutSchedule, balance: number, requested: number, lastPaidAt: Date | null) {
  if (requested > 0) return true;
  if (balance <= 0) return false;
  const today = startOfToday();
  if (schedule === "daily") return !lastPaidAt || lastPaidAt < today;
  if (schedule === "weekly") return !lastPaidAt || lastPaidAt < new Date(today.getTime() - 6 * 86400_000);
  if (schedule === "monthly") return !lastPaidAt || lastPaidAt < new Date(today.getFullYear(), today.getMonth(), 1);
  return false;
}

const money = z.number({ invalid_type_error: "Enter an amount" }).int().positive("Enter an amount");
const reference = z.string().trim().min(3, "Enter the mobile money transaction ID").max(80);
const uuidParam = (id: string, what: string) => {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, `${what} not found`);
  return id;
};

// ─── Shops & restaurants ───────────────────────────────────────────────────

adminOwedRouter.get("/owed/shops", async (req, res) => {
  const { period } = parse(periodSchema, req.query);
  const from = since(period);
  const [list, bal, sold, paidIn, last, asked] = await Promise.all([
    db
      .select({ shop: shops, owner: users.fullName })
      .from(shops)
      .innerJoin(users, eq(users.id, shops.ownerId))
      .where(inArray(shops.status, ["approved", "suspended"])),
    db.select({ shopId: walletEntries.shopId, n: sql<number>`sum(${walletEntries.amount})::int` }).from(walletEntries).groupBy(walletEntries.shopId),
    db
      .select({
        shopId: orders.shopId,
        count: sql<number>`count(*)::int`,
        sales: sql<number>`coalesce(sum(${orders.subtotal}), 0)::int`,
        commission: sql<number>`coalesce(sum(${orders.commission}), 0)::int`,
        earned: sql<number>`coalesce(sum(${orders.sellerEarning}), 0)::int`,
      })
      .from(orders)
      .where(and(eq(orders.status, "delivered"), gte(orders.deliveredAt, from)))
      .groupBy(orders.shopId),
    db
      .select({ shopId: payouts.shopId, n: sql<number>`sum(${payouts.amount})::int` })
      .from(payouts)
      .where(and(eq(payouts.status, "paid"), gte(payouts.reviewedAt, from)))
      .groupBy(payouts.shopId),
    db
      .select({ shopId: payouts.shopId, at: sql<Date | null>`max(${payouts.reviewedAt})` })
      .from(payouts)
      .where(eq(payouts.status, "paid"))
      .groupBy(payouts.shopId),
    db
      .select({ shopId: payouts.shopId, n: sql<number>`sum(${payouts.amount})::int` })
      .from(payouts)
      .where(eq(payouts.status, "requested"))
      .groupBy(payouts.shopId),
  ]);
  const by = <T extends { shopId: string }>(rows: T[]) => new Map(rows.map((r) => [r.shopId, r]));
  const [balM, soldM, paidM, lastM, askedM] = [by(bal), by(sold), by(paidIn), by(last), by(asked)];
  const items: ShopBalance[] = list.map(({ shop: s, owner }) => {
    const balance = balM.get(s.id)?.n ?? 0;
    const requested = askedM.get(s.id)?.n ?? 0;
    const lastAt = lastM.get(s.id)?.at ? new Date(lastM.get(s.id)!.at as unknown as string) : null;
    const p = soldM.get(s.id);
    return {
      shop: { id: s.id, name: s.name, slug: s.slug, kind: s.kind, city: s.city, logoUrl: s.logoUrl, country: s.country },
      owner,
      balance,
      requested,
      schedule: s.payoutSchedule,
      payoutDetails:
        s.payoutMethod && s.payoutName && s.payoutPhone ? { method: s.payoutMethod as "mtn_momo" | "orange_money", name: s.payoutName, phone: s.payoutPhone } : null,
      lastPaidAt: lastAt?.toISOString() ?? null,
      due: isDue(s.payoutSchedule, balance, requested, lastAt),
      period: { orders: p?.count ?? 0, sales: p?.sales ?? 0, commission: p?.commission ?? 0, earned: p?.earned ?? 0, paidOut: paidM.get(s.id)?.n ?? 0 },
    };
  });
  // Due first, then who's owed the most.
  items.sort((a, b) => Number(b.due) - Number(a.due) || b.balance + b.requested - (a.balance + a.requested) || a.shop.name.localeCompare(b.shop.name));
  res.json({ items });
});

adminOwedRouter.put("/shops/:id/payout-schedule", async (req, res) => {
  const { schedule } = parse(z.object({ schedule: z.enum(["daily", "weekly", "monthly", "on_request"]) }), req.body);
  const id = uuidParam(req.params.id as string, "Shop");
  const [s] = await db.update(shops).set({ payoutSchedule: schedule, updatedAt: new Date() }).where(eq(shops.id, id)).returning();
  if (!s) throw new HttpError(404, "Shop not found");
  await audit(req.user!.id, "shop.payout_schedule", { type: "shop", id }, { shop: s.name, schedule });
  res.json({ schedule });
});

/** The admin sent mobile money to the shop: take it off what's owed and keep the transaction ID. */
adminOwedRouter.post("/shops/:id/pay", async (req, res) => {
  const input = parse(z.object({ amount: money, reference }), req.body);
  const id = uuidParam(req.params.id as string, "Shop");
  const [shop] = await db.select().from(shops).where(eq(shops.id, id)).limit(1);
  if (!shop) throw new HttpError(404, "Shop not found");
  if (!shop.payoutMethod || !shop.payoutName || !shop.payoutPhone) {
    throw new HttpError(400, `${shop.name} hasn't added mobile money details yet — ask them to add them under Earnings`, { amount: "No payout details" });
  }
  const payout = await db.transaction(async (tx) => {
    // Same lock as a seller's own payout request, so the same money can't be paid twice.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${shop.id}))`);
    const [bal] = await tx
      .select({ n: sql<number>`coalesce(sum(${walletEntries.amount}), 0)::int` })
      .from(walletEntries)
      .where(eq(walletEntries.shopId, shop.id));
    if (input.amount > bal.n) throw new HttpError(400, `${shop.name} is owed ${usd(Math.max(0, bal.n))} — you can't pay more than that`, { amount: "More than owed" });
    const now = new Date();
    const [p] = await tx
      .insert(payouts)
      .values({
        shopId: shop.id,
        amount: input.amount,
        method: shop.payoutMethod!,
        accountName: shop.payoutName!,
        accountPhone: shop.payoutPhone!,
        status: "paid",
        reference: input.reference,
        requestedById: req.user!.id,
        reviewedById: req.user!.id,
        reviewedAt: now,
      })
      .returning();
    await tx.insert(walletEntries).values({ shopId: shop.id, type: "payout", amount: -input.amount, payoutId: p.id, note: `Sent by YanaBuy · ${input.reference}`, byUserId: req.user!.id });
    return p;
  });
  await audit(req.user!.id, "payout.sent", { type: "payout", id: payout.id }, { shop: shop.name, amount: payout.amount, reference: input.reference });
  notify([shop.ownerId], { type: "payout", title: `${usd(payout.amount)} sent to your mobile money`, body: `Transaction ID ${input.reference}`, link: "/sell/earnings" });
  res.status(201).json({ payout: payoutOut(payout, shop), balance: await shopBalance(shop.id) });
});

// ─── Riders ────────────────────────────────────────────────────────────────

adminOwedRouter.get("/owed/riders", async (req, res) => {
  const { period } = parse(periodSchema, req.query);
  const from = since(period);
  const today = startOfToday();
  const sum = (cond: ReturnType<typeof sql>) => sql<number>`coalesce(sum(${riderEntries.amount}) filter (where ${cond}), 0)::int`;
  const count = (cond: ReturnType<typeof sql>) => sql<number>`(count(*) filter (where ${cond}))::int`;
  const [riders, stats] = await Promise.all([
    db
      .select({ id: users.id, fullName: users.fullName, phone: users.phone, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.role, "rider")),
    db
      .select({
        riderId: riderEntries.riderId,
        owed: sql<number>`coalesce(sum(${riderEntries.amount}), 0)::int`,
        todayTrips: count(sql`${riderEntries.type} = 'trip' and ${riderEntries.createdAt} >= ${today.toISOString()}::timestamptz`),
        todayEarned: sum(sql`${riderEntries.type} = 'trip' and ${riderEntries.createdAt} >= ${today.toISOString()}::timestamptz`),
        trips: count(sql`${riderEntries.type} = 'trip' and ${riderEntries.createdAt} >= ${from.toISOString()}::timestamptz`),
        earned: sum(sql`${riderEntries.type} = 'trip' and ${riderEntries.createdAt} >= ${from.toISOString()}::timestamptz`),
        paidOut: sum(sql`${riderEntries.type} = 'payout' and ${riderEntries.createdAt} >= ${from.toISOString()}::timestamptz`),
        lastPaidAt: sql<string | null>`max(${riderEntries.createdAt}) filter (where ${riderEntries.type} = 'payout')`,
      })
      .from(riderEntries)
      .groupBy(riderEntries.riderId),
  ]);
  const byRider = new Map(stats.map((s) => [s.riderId, s]));
  // Riders who were paid before but aren't riders any more still show while they're owed money.
  const missing = stats.filter((s) => !riders.some((r) => r.id === s.riderId) && s.owed !== 0).map((s) => s.riderId);
  const former = missing.length
    ? await db.select({ id: users.id, fullName: users.fullName, phone: users.phone, avatarUrl: users.avatarUrl }).from(users).where(inArray(users.id, missing))
    : [];
  const items: RiderEarnings[] = [...riders, ...former].map((r) => {
    const s = byRider.get(r.id);
    return {
      rider: r,
      owed: s?.owed ?? 0,
      today: { trips: s?.todayTrips ?? 0, earned: s?.todayEarned ?? 0 },
      period: { trips: s?.trips ?? 0, earned: s?.earned ?? 0, paidOut: -(s?.paidOut ?? 0) },
      lastPaidAt: s?.lastPaidAt ? new Date(s.lastPaidAt).toISOString() : null,
    };
  });
  items.sort((a, b) => b.owed - a.owed || a.rider.fullName.localeCompare(b.rider.fullName));
  res.json({ items });
});

export async function riderEntriesFor(riderId: string, limit = 100): Promise<RiderEarningEntry[]> {
  const rows = await db
    .select({ e: riderEntries, number: orders.number })
    .from(riderEntries)
    .leftJoin(orders, eq(orders.id, riderEntries.orderId))
    .where(eq(riderEntries.riderId, riderId))
    .orderBy(desc(riderEntries.createdAt))
    .limit(limit);
  return rows.map(({ e, number }) => ({
    id: e.id,
    type: e.type,
    amount: e.amount,
    orderNumber: number ? orderNumber(number) : null,
    reference: e.reference,
    note: e.note,
    createdAt: e.createdAt.toISOString(),
  }));
}

adminOwedRouter.get("/riders/:id/earnings", async (req, res) => {
  const id = uuidParam(req.params.id as string, "Rider");
  res.json({ owed: await riderBalance(id), entries: await riderEntriesFor(id) });
});

/** The admin sent the rider their delivery pay by mobile money. */
adminOwedRouter.post("/riders/:id/pay", async (req, res) => {
  const input = parse(z.object({ amount: money, reference }), req.body);
  const id = uuidParam(req.params.id as string, "Rider");
  const [rider] = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.id, id)).limit(1);
  if (!rider) throw new HttpError(404, "Rider not found");
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"rider:" + id}))`);
    const [bal] = await tx
      .select({ n: sql<number>`coalesce(sum(${riderEntries.amount}), 0)::int` })
      .from(riderEntries)
      .where(eq(riderEntries.riderId, id));
    if (input.amount > bal.n) throw new HttpError(400, `${rider.fullName} is owed ${usd(Math.max(0, bal.n))} — you can't pay more than that`, { amount: "More than owed" });
    await tx.insert(riderEntries).values({ riderId: id, type: "payout", amount: -input.amount, reference: input.reference, note: "Sent by YanaBuy", byUserId: req.user!.id });
  });
  await audit(req.user!.id, "rider.paid", { type: "user", id }, { rider: rider.fullName, amount: input.amount, reference: input.reference });
  notify([id], { type: "payout", title: `${usd(input.amount)} delivery pay sent to your mobile money`, body: `Transaction ID ${input.reference}`, link: "/rider" });
  res.status(201).json({ owed: await riderBalance(id), entries: await riderEntriesFor(id) });
});

// ─── Send by MoMo (MTN Disbursements) ──────────────────────────────────────

adminOwedRouter.get("/momo-send", async (_req, res) => {
  const { maxMomoSend } = await getFinance();
  res.json({ configured: disbursementConfigured(), cap: maxMomoSend, environment: env.MTN_MOMO_TARGET_ENV, currency: env.MTN_MOMO_CURRENCY });
});

/** Sends the shop's money straight to their MTN number and records it. */
adminOwedRouter.post("/shops/:id/send-momo", async (req, res) => {
  const { amount } = parse(z.object({ amount: money }), req.body);
  const id = uuidParam(req.params.id as string, "Shop");
  res.json(await sendShopPayout(id, amount, req.user!.id));
});

/** Sends the rider's delivery pay straight to their MTN number (the one they log in with) and records it. */
adminOwedRouter.post("/riders/:id/send-momo", async (req, res) => {
  const { amount } = parse(z.object({ amount: money }), req.body);
  const id = uuidParam(req.params.id as string, "Rider");
  res.json(await sendRiderPayout(id, amount, req.user!.id));
});
