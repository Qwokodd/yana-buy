import { eq, sql } from "drizzle-orm";
import type { FinanceSettings } from "@yanabuy/shared";
import { db } from "../db/client";
import { orders, settings, walletEntries } from "../db/schema";

const KEY = "finance";

export const DEFAULT_FINANCE: FinanceSettings = { goodsCommission: 10, foodCommission: 10, minPayout: 1000 } // $10;

export async function getFinance(): Promise<FinanceSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  return { ...DEFAULT_FINANCE, ...((row?.value ?? {}) as Partial<FinanceSettings>) };
}

export async function saveFinance(value: FinanceSettings, adminId: string) {
  const now = new Date();
  await db
    .insert(settings)
    .values({ key: KEY, value, updatedAt: now, updatedById: adminId })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now, updatedById: adminId } });
  return getFinance();
}

/**
 * When an order is delivered: work out YanaBuy's commission on the items
 * (delivery fees go to YanaBuy) and credit the rest to the shop's wallet.
 * Safe to call twice — the wallet only takes one "sale" per order.
 */
export async function recordSale(orderId: string) {
  const f = await getFinance();
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update").limit(1);
    if (!o || o.status !== "delivered") return;
    const rate = o.kind === "food" ? f.foodCommission : f.goodsCommission;
    const commission = o.commission ?? Math.round((o.subtotal * rate) / 100);
    const earning = o.subtotal - commission;
    await tx.update(orders).set({ commission, sellerEarning: earning }).where(eq(orders.id, o.id));
    await tx
      .insert(walletEntries)
      .values({ shopId: o.shopId, type: "sale", amount: earning, orderId: o.id, note: `${rate}% commission taken` })
      .onConflictDoNothing();
  });
}

export async function shopBalance(shopId: string) {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${walletEntries.amount}), 0)::int` })
    .from(walletEntries)
    .where(eq(walletEntries.shopId, shopId));
  return row.n;
}

