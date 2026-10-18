import { Router } from "express";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import type { Wallet } from "@yanabuy/shared";
import { db } from "../db/client";
import { payouts, shops, walletEntries } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { getFinance, shopBalance } from "../lib/finance";
import { monthFor, payoutOut, payoutsFor, walletEntriesFor } from "../lib/wallet";
import { phone, requiredText } from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import { notifyAdmins } from "../lib/notify";

/** A seller's earnings and payouts. Mounted at /api/shop/wallet. */
export const shopWalletRouter = Router();
shopWalletRouter.use(requireAuth);

async function myShop(userId: string) {
  const [shop] = await db.select().from(shops).where(eq(shops.ownerId, userId)).limit(1);
  if (!shop) throw new HttpError(404, "Open a shop first");
  return shop;
}

shopWalletRouter.get("/", async (req, res) => {
  const shop = await myShop(req.user!.id);
  const [f, balance, month, entries, list, [waiting]] = await Promise.all([
    getFinance(),
    shopBalance(shop.id),
    monthFor(shop.id),
    walletEntriesFor(shop.id),
    payoutsFor(shop.id, shop),
    db
      .select({ n: sql<number>`coalesce(sum(${payouts.amount}), 0)::int` })
      .from(payouts)
      .where(and(eq(payouts.shopId, shop.id), eq(payouts.status, "requested"))),
  ]);
  const wallet: Wallet = {
    balance,
    salesThisMonth: month.sales,
    earnedThisMonth: month.earned,
    pendingPayouts: waiting.n,
    payoutDetails:
      shop.payoutMethod && shop.payoutName && shop.payoutPhone
        ? { method: shop.payoutMethod as "mtn_momo" | "orange_money", name: shop.payoutName, phone: shop.payoutPhone }
        : null,
    minPayout: f.minPayout,
    commission: shop.kind === "restaurant" ? f.foodCommission : f.goodsCommission,
    entries,
    payouts: list,
  };
  res.json({ wallet });
});

const detailsSchema = z.object({
  method: z.enum(["mtn_momo", "orange_money"], { errorMap: () => ({ message: "Choose MTN or Orange" }) }),
  name: requiredText(2, 80, "Name on the account"),
  phone,
});

shopWalletRouter.put("/payout-details", async (req, res) => {
  const input = parse(detailsSchema, req.body);
  const shop = await myShop(req.user!.id);
  await db.update(shops).set({ payoutMethod: input.method, payoutName: input.name, payoutPhone: input.phone, updatedAt: new Date() }).where(eq(shops.id, shop.id));
  res.json({ payoutDetails: input });
});

/** Ask YanaBuy to send money. The amount leaves the balance straight away and comes back if refused. */
shopWalletRouter.post("/payouts", async (req, res) => {
  const { amount } = parse(z.object({ amount: z.number({ invalid_type_error: "Enter an amount" }).int().positive("Enter an amount") }), req.body);
  const shop = await myShop(req.user!.id);
  if (shop.status !== "approved") throw new HttpError(403, "Your shop must be open to ask for a payout. Contact YanaBuy support.");
  if (!shop.payoutMethod || !shop.payoutPhone || !shop.payoutName) {
    throw new HttpError(400, "Add your mobile money details first", { payoutDetails: "Missing" });
  }
  const f = await getFinance();
  if (amount < f.minPayout) throw new HttpError(400, `The smallest payout is $${(f.minPayout / 100).toLocaleString("en-US")}`, { amount: "Too small" });

  const payout = await db.transaction(async (tx) => {
    // Lock this shop's wallet so two requests can't both spend the same money.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${shop.id}))`);
    const [bal] = await tx
      .select({ n: sql<number>`coalesce(sum(${walletEntries.amount}), 0)::int` })
      .from(walletEntries)
      .where(eq(walletEntries.shopId, shop.id));
    if (amount > bal.n) throw new HttpError(400, `You can take out up to $${(bal.n / 100).toLocaleString("en-US")}`, { amount: "More than your balance" });
    const [p] = await tx
      .insert(payouts)
      .values({ shopId: shop.id, amount, method: shop.payoutMethod!, accountName: shop.payoutName!, accountPhone: shop.payoutPhone!, requestedById: req.user!.id })
      .returning();
    await tx.insert(walletEntries).values({ shopId: shop.id, type: "payout", amount: -amount, payoutId: p.id, byUserId: req.user!.id });
    return p;
  });
  notifyAdmins({ title: `Payout request: $${(payout.amount / 100).toFixed(2)} for ${shop.name}`, body: `To ${payout.accountName} · ${payout.accountPhone}`, path: "/payouts" });
  res.status(201).json({ payout: payoutOut(payout, shop) });
});
