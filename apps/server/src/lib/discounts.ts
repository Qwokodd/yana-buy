import { and, count, eq, sql } from "drizzle-orm";
import type { DiscountCode } from "@yanabuy/shared";
import { db } from "../db/client";
import { discountCodes, discountRedemptions } from "../db/schema";

type CodeRow = typeof discountCodes.$inferSelect;

export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

export function discountOut(c: CodeRow, totalDiscount = 0): DiscountCode {
  return {
    id: c.id,
    code: c.code,
    description: c.description,
    type: c.type,
    value: c.value,
    maxDiscount: c.maxDiscount,
    minSubtotal: c.minSubtotal,
    mode: c.mode as DiscountCode["mode"],
    startsAt: c.startsAt?.toISOString() ?? null,
    endsAt: c.endsAt?.toISOString() ?? null,
    usageLimit: c.usageLimit,
    perBuyerLimit: c.perBuyerLimit,
    active: c.active,
    timesUsed: c.timesUsed,
    totalDiscount,
    createdAt: c.createdAt.toISOString(),
  };
}

/** Money with the dollar sign, for messages. */
const usd = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;

export interface Eligible {
  goods: number;
  food: number;
}

/**
 * Works out what a code takes off. `eligible` is the items' total split by side of the app.
 * Returns the amount, or a plain-words reason it doesn't apply.
 */
export async function evaluateCode(
  raw: string,
  eligible: Eligible,
  userId: string | null
): Promise<{ row: CodeRow; amount: number; problem: null } | { row: CodeRow | null; amount: 0; problem: string }> {
  const code = normalizeCode(raw);
  const [row] = await db.select().from(discountCodes).where(eq(discountCodes.code, code)).limit(1);
  if (!row || !row.active) return { row: null, amount: 0, problem: "That code doesn't exist or has ended" };
  const now = Date.now();
  if (row.startsAt && row.startsAt.getTime() > now) return { row, amount: 0, problem: "That code isn't valid yet" };
  if (row.endsAt && row.endsAt.getTime() < now) return { row, amount: 0, problem: "That code has expired" };
  if (row.usageLimit !== null && row.timesUsed >= row.usageLimit) return { row, amount: 0, problem: "That code has been used up" };
  if (row.perBuyerLimit !== null && userId) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(discountRedemptions)
      .where(and(eq(discountRedemptions.codeId, row.id), eq(discountRedemptions.userId, userId)));
    if (n >= row.perBuyerLimit) return { row, amount: 0, problem: row.perBuyerLimit === 1 ? "You've already used this code" : "You've used this code as many times as allowed" };
  }
  const base = row.mode === "goods" ? eligible.goods : row.mode === "food" ? eligible.food : eligible.goods + eligible.food;
  if (base <= 0) return { row, amount: 0, problem: row.mode === "food" ? "This code is for food orders" : row.mode === "goods" ? "This code is for shop items, not food" : "Add something to your cart first" };
  if (row.minSubtotal !== null && base < row.minSubtotal) return { row, amount: 0, problem: `Spend at least ${usd(row.minSubtotal)} to use this code` };
  let amount = row.type === "percent" ? Math.floor((base * row.value) / 100) : row.value;
  if (row.type === "percent" && row.maxDiscount !== null) amount = Math.min(amount, row.maxDiscount);
  amount = Math.min(amount, base);
  if (amount <= 0) return { row, amount: 0, problem: "This code doesn't take anything off this cart" };
  return { row, amount, problem: null };
}

/** Splits the money off across shops in proportion to their eligible items (whole cents, adds up exactly). */
export function splitDiscount(amount: number, parts: number[]): number[] {
  const total = parts.reduce((a, b) => a + b, 0);
  if (!total) return parts.map(() => 0);
  const out = parts.map((p) => Math.floor((amount * p) / total));
  let left = amount - out.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0 && i < out.length; i++) {
    if (parts[i] > out[i]) {
      out[i]++;
      left--;
    }
  }
  return out;
}

export const discountTotals = () =>
  db
    .select({ codeId: discountRedemptions.codeId, total: sql<number>`coalesce(sum(${discountRedemptions.amount}), 0)::int` })
    .from(discountRedemptions)
    .groupBy(discountRedemptions.codeId);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** At checkout: locks the code and checks it can still be used (limits, dates). Returns the row or the reason it can't. */
export async function lockCode(tx: Tx, code: string, userId: string): Promise<CodeRow | string> {
  const [row] = await tx.select().from(discountCodes).where(eq(discountCodes.code, normalizeCode(code))).for("update").limit(1);
  if (!row || !row.active) return "That code doesn't exist or has ended";
  const now = Date.now();
  if ((row.startsAt && row.startsAt.getTime() > now) || (row.endsAt && row.endsAt.getTime() < now)) return "That code isn't valid right now";
  if (row.usageLimit !== null && row.timesUsed >= row.usageLimit) return "That code has been used up";
  if (row.perBuyerLimit !== null) {
    const [{ n }] = await tx.select({ n: count() }).from(discountRedemptions).where(and(eq(discountRedemptions.codeId, row.id), eq(discountRedemptions.userId, userId)));
    if (n >= row.perBuyerLimit) return "You've already used this code";
  }
  return row;
}
