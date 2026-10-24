import { eq, sql } from "drizzle-orm";
import { formatLD, withCommission, type FinanceSettings, type Fulfilment } from "@yanabuy/shared";
import { db } from "../db/client";
import { orders, riderEntries, settings, walletEntries } from "../db/schema";

const KEY = "finance";

export const DEFAULT_FINANCE: FinanceSettings = { goodsCommission: 10, foodCommission: 10, pickupCommission: 5, minPayout: 1000, maxMomoSend: 50000 }; // min payout $10; Send by MoMo up to $500

/** Last-read settings, so prices can be worked out without a database call each time. Kept fresh by getFinance(). */
let current: FinanceSettings = DEFAULT_FINANCE;

export async function getFinance(): Promise<FinanceSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  current = { ...DEFAULT_FINANCE, ...((row?.value ?? {}) as Partial<FinanceSettings>) };
  return current;
}

/**
 * Commission % for a kind of item (as last loaded). Food depends on how the buyer gets it:
 * delivery = the restaurant commission, pickup = the pickup commission, eat in = none (the restaurant's own price).
 */
export function commissionRate(kind: "goods" | "food", how: Fulfilment = "delivery") {
  if (kind === "goods") return current.goodsCommission;
  if (how === "eat_in") return 0;
  if (how === "pickup") return current.pickupCommission;
  return current.foodCommission;
}

/**
 * What buyers pay: the seller's price with YanaBuy's commission added on top.
 * Buyers only ever see this one price — never the split.
 */
export const buyerPrice = (sellerCents: number, kind: "goods" | "food", how: Fulfilment = "delivery") => withCommission(sellerCents, commissionRate(kind, how));
export function buyerPriceOrNull(sellerCents: number | null, kind: "goods" | "food", how: Fulfilment = "delivery") {
  return sellerCents === null ? null : buyerPrice(sellerCents, kind, how);
}

/** The food choice the app sends (X-Food-How): delivery, pickup or eat_in. Delivery if not sent. */
export function foodHowOf(req: { get(name: string): string | undefined }): Fulfilment {
  const v = req.get("x-food-how");
  return v === "pickup" || v === "eat_in" ? v : "delivery";
}

/** Reload the commission every minute too, in case it was changed by another server. */
setInterval(() => void getFinance().catch(() => {}), 60_000).unref();

export async function saveFinance(value: FinanceSettings, adminId: string) {
  const now = new Date();
  await db
    .insert(settings)
    .values({ key: KEY, value, updatedAt: now, updatedById: adminId })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now, updatedById: adminId } });
  return getFinance();
}

/**
 * When an order is delivered: credit the shop with its own prices (YanaBuy's commission was added on
 * top of them at checkout, so the shop gets everything it listed), and credit the rider with the full
 * delivery fee for the trip. Safe to call twice — each wallet only takes one entry per order.
 */
export async function recordSale(orderId: string) {
  const f = await getFinance();
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update").limit(1);
    if (!o || o.status !== "delivered") return;
    const rate = o.kind === "food" ? f.foodCommission : f.goodsCommission;
    // Orders since commission went on top have it saved at checkout; older ones took it out of the price.
    const onTop = o.commission !== null;
    const commission = o.commission ?? Math.round((o.subtotal * rate) / 100);
    const earning = o.subtotal - commission;
    await tx.update(orders).set({ commission, sellerEarning: earning }).where(eq(orders.id, o.id));
    // Eat in / pickup paid at the restaurant: the shop already has the buyer's money (the total),
    // so its balance only moves by the difference — usually minus the commission it owes YanaBuy.
    const keptByShop = o.fulfilment !== "delivery" && o.paymentMethod === "cod";
    const amount = keptByShop ? earning - o.total : earning;
    const note = keptByShop
      ? `Paid at the restaurant (${formatLD(o.total)} kept by the shop) · ${formatLD(commission)} YanaBuy commission owed`
      : onTop
        ? "Your full price"
        : `${rate}% commission taken`;
    await tx
      .insert(walletEntries)
      .values({ shopId: o.shopId, type: "sale", amount, orderId: o.id, note })
      .onConflictDoNothing();
    // The rider who delivered it earns the whole delivery fee.
    if (o.riderId && o.fulfilment === "delivery" && o.deliveryFee > 0) {
      await tx
        .insert(riderEntries)
        .values({ riderId: o.riderId, type: "trip", amount: o.deliveryFee, orderId: o.id, note: "Delivery fee" })
        .onConflictDoNothing();
    }
  });
}

export async function shopBalance(shopId: string) {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${walletEntries.amount}), 0)::int` })
    .from(walletEntries)
    .where(eq(walletEntries.shopId, shopId));
  return row.n;
}


/** What YanaBuy owes a rider right now. */
export async function riderBalance(riderId: string) {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${riderEntries.amount}), 0)::int` })
    .from(riderEntries)
    .where(eq(riderEntries.riderId, riderId));
  return row.n;
}
