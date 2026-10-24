import crypto from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { formatLD, type MomoSendResult } from "@yanabuy/shared";
import { db } from "../../db/client";
import { momoTransfers, payouts, riderEntries, shops, users, walletEntries, type MomoTransferRow } from "../../db/schema";
import { env } from "../../env";
import { audit } from "../audit";
import { getFinance } from "../finance";
import { HttpError } from "../http";
import { notify } from "../notify";
import { disbursementConfigured, transfer, transferStatus } from "./mtn-disbursement";

/**
 * "Send by MoMo": pay a shop or rider straight from YanaBuy's MTN wallet.
 *
 * Order of events (so money is never sent twice and never lost):
 *  1. Under a lock: check the balance, take the amount off what's owed (payout / rider entry) and
 *     save a pending transfer — all in one database transaction.
 *  2. Ask MTN to send it.
 *  3. MTN says it went → keep it, save MTN's transaction ID, tell the shop/rider.
 *     MTN says it failed → put the money back on what's owed.
 *     No answer yet → stays pending; the sweeper checks every minute until MTN gives a result.
 */

/** If MTN has no record of a transfer after this long, it never reached them: put the money back. */
const NOT_FOUND_GIVE_UP_MS = 10 * 60 * 1000;

async function checkCanSend(amount: number) {
  if (!disbursementConfigured()) throw new HttpError(400, "Sending by MoMo isn't set up — add the MTN Disbursements keys to the server settings");
  const { maxMomoSend } = await getFinance();
  if (maxMomoSend <= 0) throw new HttpError(400, "Sending by MoMo is switched off (the limit is $0 in Money → Commission & payouts)");
  if (amount > maxMomoSend) {
    throw new HttpError(400, `That's over the ${formatLD(maxMomoSend)} limit for one MoMo send. Send it by hand and record it, or raise the limit in Money.`, { amount: "Over the limit" });
  }
}

const pendingFor = (tx: typeof db, cond: ReturnType<typeof eq>) =>
  tx.select({ id: momoTransfers.id }).from(momoTransfers).where(and(cond, eq(momoTransfers.status, "pending"))).limit(1);

export async function sendShopPayout(shopId: string, amount: number, adminId: string): Promise<MomoSendResult> {
  await checkCanSend(amount);
  const [shop] = await db.select().from(shops).where(eq(shops.id, shopId)).limit(1);
  if (!shop) throw new HttpError(404, "Shop not found");
  if (!shop.payoutName || !shop.payoutPhone || !shop.payoutMethod) {
    throw new HttpError(400, `${shop.name} hasn't added mobile money details yet — ask them to add them under Earnings`);
  }
  if (shop.payoutMethod !== "mtn_momo") throw new HttpError(400, `${shop.name} gets paid by Orange Money — send it by hand and record it`);

  const t = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${shop.id}))`);
    if ((await pendingFor(tx as unknown as typeof db, eq(momoTransfers.shopId, shop.id))).length) {
      throw new HttpError(409, `A MoMo send to ${shop.name} is still waiting on MTN — wait for it to finish first`);
    }
    const [bal] = await tx.select({ n: sql<number>`coalesce(sum(${walletEntries.amount}), 0)::int` }).from(walletEntries).where(eq(walletEntries.shopId, shop.id));
    if (amount > bal.n) throw new HttpError(400, `${shop.name} is owed ${formatLD(Math.max(0, bal.n))} — you can't send more than that`, { amount: "More than owed" });
    const now = new Date();
    const [p] = await tx
      .insert(payouts)
      .values({
        shopId: shop.id,
        amount,
        method: "mtn_momo",
        accountName: shop.payoutName!,
        accountPhone: shop.payoutPhone!,
        status: "paid",
        reference: "Sending by MTN MoMo…",
        requestedById: adminId,
        reviewedById: adminId,
        reviewedAt: now,
      })
      .returning();
    await tx.insert(walletEntries).values({ shopId: shop.id, type: "payout", amount: -amount, payoutId: p.id, note: "Sending by MTN MoMo…", byUserId: adminId });
    const [row] = await tx
      .insert(momoTransfers)
      .values({ kind: "shop", shopId: shop.id, amount, currency: env.MTN_MOMO_CURRENCY, phone: shop.payoutPhone!, name: shop.payoutName!, providerRef: crypto.randomUUID(), payoutId: p.id, byUserId: adminId })
      .returning();
    return row;
  });
  await audit(adminId, "payout.momo_started", { type: "shop", id: shop.id }, { shop: shop.name, amount, phone: t.phone });
  return startAndWait(t, `YanaBuy payout to ${shop.name}`);
}

export async function sendRiderPayout(riderId: string, amount: number, adminId: string): Promise<MomoSendResult> {
  await checkCanSend(amount);
  const [rider] = await db.select({ id: users.id, fullName: users.fullName, phone: users.phone }).from(users).where(eq(users.id, riderId)).limit(1);
  if (!rider) throw new HttpError(404, "Rider not found");
  if (!rider.phone) throw new HttpError(400, `${rider.fullName} has no phone number on their account`);

  const t = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"rider:" + rider.id}))`);
    if ((await pendingFor(tx as unknown as typeof db, eq(momoTransfers.riderId, rider.id))).length) {
      throw new HttpError(409, `A MoMo send to ${rider.fullName} is still waiting on MTN — wait for it to finish first`);
    }
    const [bal] = await tx.select({ n: sql<number>`coalesce(sum(${riderEntries.amount}), 0)::int` }).from(riderEntries).where(eq(riderEntries.riderId, rider.id));
    if (amount > bal.n) throw new HttpError(400, `${rider.fullName} is owed ${formatLD(Math.max(0, bal.n))} — you can't send more than that`, { amount: "More than owed" });
    const [e] = await tx
      .insert(riderEntries)
      .values({ riderId: rider.id, type: "payout", amount: -amount, reference: "Sending by MTN MoMo…", note: "Sent by YanaBuy (MTN MoMo)", byUserId: adminId })
      .returning();
    const [row] = await tx
      .insert(momoTransfers)
      .values({ kind: "rider", riderId: rider.id, amount, currency: env.MTN_MOMO_CURRENCY, phone: rider.phone!, name: rider.fullName, providerRef: crypto.randomUUID(), riderEntryId: e.id, byUserId: adminId })
      .returning();
    return row;
  });
  await audit(adminId, "rider.momo_started", { type: "user", id: rider.id }, { rider: rider.fullName, amount, phone: t.phone });
  return startAndWait(t, "YanaBuy delivery pay");
}

/** Sends the transfer to MTN, then waits up to ~25 seconds for the result. */
async function startAndWait(t: MomoTransferRow, note: string): Promise<MomoSendResult> {
  let sent: Awaited<ReturnType<typeof transfer>>;
  try {
    sent = await transfer({ reference: t.providerRef, cents: t.amount, phone: t.phone, externalId: t.id, note });
  } catch (err) {
    // Couldn't even get a token etc. — MTN never got the request.
    sent = { result: "rejected", detail: String((err as Error).message ?? err) };
  }
  if (sent.result === "rejected") {
    console.error("MTN transfer refused:", sent.detail);
    await settle(t, "failed", `MTN didn't accept the send ${sent.detail}`.trim());
    return { status: "failed", transactionId: null, message: `MTN didn't accept it, so nothing was sent and the ${formatLD(t.amount)} is back on what's owed. ${sent.detail}`.trim() };
  }
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const fresh = await refreshTransfer(t.id);
    if (fresh?.status === "successful") return { status: "successful", transactionId: fresh.providerTxnId, message: `${formatLD(t.amount)} sent to ${t.name} (${t.phone}). MTN transaction ID ${fresh.providerTxnId ?? "—"}.` };
    if (fresh?.status === "failed") return { status: "failed", transactionId: null, message: `MTN said the send failed (${fresh.failureReason ?? "no reason given"}). Nothing was sent and the ${formatLD(t.amount)} is back on what's owed.` };
  }
  return {
    status: "pending",
    transactionId: null,
    message: `MTN is still working on it. The ${formatLD(t.amount)} is held while we wait — YanaBuy checks with MTN every minute; refresh this page in a few minutes to see the result. Don't send it again by hand.`,
  };
}

/** Asks MTN how a pending transfer is doing and settles it if there's an answer. */
export async function refreshTransfer(id: string) {
  const [t] = await db.select().from(momoTransfers).where(eq(momoTransfers.id, id)).limit(1);
  if (!t || t.status !== "pending") return t;
  try {
    const s = await transferStatus(t.providerRef);
    if (s.status === "SUCCESSFUL") await settle(t, "successful", null, s.transactionId);
    else if (s.status === "FAILED") await settle(t, "failed", s.reason ?? "Declined by MTN");
    else if (s.status === "NOT_FOUND" && Date.now() - t.createdAt.getTime() > NOT_FOUND_GIVE_UP_MS) await settle(t, "failed", "MTN never received it");
    else await db.update(momoTransfers).set({ lastCheckedAt: new Date() }).where(eq(momoTransfers.id, t.id));
  } catch (err) {
    console.error("MTN transfer status check failed:", err);
  }
  const [fresh] = await db.select().from(momoTransfers).where(eq(momoTransfers.id, id)).limit(1);
  return fresh;
}

async function settle(t: MomoTransferRow, status: "successful" | "failed", reason: string | null, txnId: string | null = null) {
  const done = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(momoTransfers)
      .set({ status, failureReason: reason, providerTxnId: txnId, completedAt: new Date(), lastCheckedAt: new Date() })
      .where(and(eq(momoTransfers.id, t.id), eq(momoTransfers.status, "pending")))
      .returning();
    if (!row) return null; // already settled
    const ref = txnId ?? `MTN ${t.providerRef.slice(0, 8)}`;
    if (t.kind === "shop" && t.payoutId) {
      if (status === "successful") {
        await tx.update(payouts).set({ reference: ref }).where(eq(payouts.id, t.payoutId));
        await tx.update(walletEntries).set({ note: `Sent by YanaBuy (MTN MoMo) · ${ref}` }).where(and(eq(walletEntries.payoutId, t.payoutId), eq(walletEntries.type, "payout")));
      } else {
        await tx.update(payouts).set({ status: "rejected", reference: null, reason: `MTN MoMo send failed: ${reason ?? "no reason"}` }).where(eq(payouts.id, t.payoutId));
        await tx.update(walletEntries).set({ note: "MTN MoMo send — failed" }).where(and(eq(walletEntries.payoutId, t.payoutId), eq(walletEntries.type, "payout")));
        await tx.insert(walletEntries).values({ shopId: t.shopId!, type: "payout_returned", amount: t.amount, payoutId: t.payoutId, note: "MTN MoMo send failed — put back", byUserId: t.byUserId });
      }
    }
    if (t.kind === "rider" && t.riderEntryId) {
      if (status === "successful") {
        await tx.update(riderEntries).set({ reference: ref }).where(eq(riderEntries.id, t.riderEntryId));
      } else {
        await tx.update(riderEntries).set({ reference: null, note: "MTN MoMo send — failed" }).where(eq(riderEntries.id, t.riderEntryId));
        await tx.insert(riderEntries).values({ riderId: t.riderId!, type: "adjustment", amount: t.amount, note: "MTN MoMo send failed — put back", byUserId: t.byUserId });
      }
    }
    return row;
  });
  if (!done) return;
  const adminId = t.byUserId;
  const ref = txnId ?? `MTN ${t.providerRef.slice(0, 8)}`;
  if (t.kind === "shop" && t.shopId) {
    if (adminId) await audit(adminId, status === "successful" ? "payout.momo_sent" : "payout.momo_failed", { type: "shop", id: t.shopId }, { name: t.name, amount: t.amount, reference: txnId, reason });
    if (status === "successful") {
      const [s] = await db.select({ ownerId: shops.ownerId }).from(shops).where(eq(shops.id, t.shopId)).limit(1);
      notify([s?.ownerId], { type: "payout", title: `${formatLD(t.amount)} sent to your mobile money`, body: `MTN transaction ID ${ref}`, link: "/sell/earnings" });
    }
  }
  if (t.kind === "rider" && t.riderId) {
    if (adminId) await audit(adminId, status === "successful" ? "rider.momo_sent" : "rider.momo_failed", { type: "user", id: t.riderId }, { name: t.name, amount: t.amount, reference: txnId, reason });
    if (status === "successful") notify([t.riderId], { type: "payout", title: `${formatLD(t.amount)} delivery pay sent to your mobile money`, body: `MTN transaction ID ${ref}`, link: "/rider" });
  }
}

/** Every minute, finish any sends MTN hadn't answered yet. */
export function startTransferSweeper() {
  return setInterval(async () => {
    if (!disbursementConfigured()) return;
    try {
      const stale = await db
        .select({ id: momoTransfers.id })
        .from(momoTransfers)
        .where(and(eq(momoTransfers.status, "pending"), lt(momoTransfers.createdAt, new Date(Date.now() - 30_000))))
        .limit(50);
      for (const t of stale) await refreshTransfer(t.id);
    } catch (err) {
      console.error("MoMo transfer sweeper:", err);
    }
  }, 60_000).unref();
}
