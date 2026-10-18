import { and, desc, eq, gte, sql } from "drizzle-orm";
import { orderNumber, payoutNumber, type Payout, type PayoutMethod, type WalletEntry } from "@yanabuy/shared";
import { db } from "../db/client";
import { orders, payouts, walletEntries, type PayoutRow, type ShopRow } from "../db/schema";

export function payoutOut(p: PayoutRow, shop: ShopRow): Payout {
  return {
    id: p.id,
    number: payoutNumber(p.number ?? 0),
    amount: p.amount,
    method: p.method as PayoutMethod,
    accountName: p.accountName,
    accountPhone: p.accountPhone,
    status: p.status,
    reference: p.reference,
    reason: p.reason,
    createdAt: p.createdAt.toISOString(),
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    shop: { id: shop.id, name: shop.name, slug: shop.slug, kind: shop.kind, city: shop.city, logoUrl: shop.logoUrl, country: shop.country },
  };
}

export async function walletEntriesFor(shopId: string, limit = 100): Promise<WalletEntry[]> {
  const rows = await db
    .select({ e: walletEntries, orderNo: orders.number, payoutNo: payouts.number })
    .from(walletEntries)
    .leftJoin(orders, eq(orders.id, walletEntries.orderId))
    .leftJoin(payouts, eq(payouts.id, walletEntries.payoutId))
    .where(eq(walletEntries.shopId, shopId))
    .orderBy(desc(walletEntries.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.e.id,
    type: r.e.type,
    amount: r.e.amount,
    note: r.e.note,
    orderNumber: r.orderNo ? orderNumber(r.orderNo) : null,
    payoutNumber: r.payoutNo ? payoutNumber(r.payoutNo) : null,
    createdAt: r.e.createdAt.toISOString(),
  }));
}

export function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Delivered this month for one shop: sales before commission and what the shop earned. */
export async function monthFor(shopId: string) {
  const [row] = await db
    .select({
      sales: sql<number>`coalesce(sum(${orders.subtotal}), 0)::int`,
      earned: sql<number>`coalesce(sum(${orders.sellerEarning}), 0)::int`,
    })
    .from(orders)
    .where(and(eq(orders.shopId, shopId), eq(orders.status, "delivered"), gte(orders.deliveredAt, startOfMonth())));
  return row;
}

export async function payoutsFor(shopId: string, shop: ShopRow) {
  const rows = await db.select().from(payouts).where(eq(payouts.shopId, shopId)).orderBy(desc(payouts.createdAt)).limit(30);
  return rows.map((p) => payoutOut(p, shop));
}

