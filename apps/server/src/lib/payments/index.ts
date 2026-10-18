import crypto from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { orderNumber, type Payment, type PaymentMethod } from "@yanabuy/shared";
import { db } from "../../db/client";
import { orderEvents, orders, payments, shops, sourcingEvents, sourcingRequests, type PaymentRow } from "../../db/schema";
import { env } from "../../env";
import { HttpError } from "../http";
import { moveOrder } from "../orders";
import { notify } from "../notify";
import { paymentStatus, requestToPay } from "./mtn";

/** A payment prompt that isn't approved within 10 minutes is given up on. */
const EXPIRE_MS = 10 * 60 * 1000;

export async function paymentOut(p: PaymentRow): Promise<Payment> {
  const linked = await db.select({ id: orders.id }).from(orders).where(eq(orders.paymentId, p.id));
  return {
    id: p.id,
    method: p.method,
    amount: p.amount,
    payerPhone: p.payerPhone,
    status: p.status,
    failureReason: p.failureReason,
    orderIds: linked.map((o) => o.id),
    sourcingId: p.sourcingId,
  };
}

/** Sends the "approve with your PIN" prompt to the buyer's phone. */
export async function startPayment(p: { buyerId: string; method: PaymentMethod; amount: number; phone: string; orderIds: string[]; sourcingId?: string; label: string }) {
  if (p.method !== "mtn_momo") throw new HttpError(400, "That way of paying isn't available yet");
  const reference = crypto.randomUUID();
  const [row] = await db
    .insert(payments)
    .values({ buyerId: p.buyerId, method: p.method, amount: p.amount, currency: env.MTN_MOMO_CURRENCY, payerPhone: p.phone, providerRef: reference, sourcingId: p.sourcingId ?? null })
    .returning();
  if (p.orderIds.length) await db.update(orders).set({ paymentId: row.id }).where(inArray(orders.id, p.orderIds));
  try {
    await requestToPay({ reference, cents: p.amount, phone: p.phone, externalId: row.id, message: p.label });
  } catch (err) {
    await finish(row, "failed", "MTN couldn't send the payment prompt. Check the number and try again.");
    console.error("MTN requestToPay failed:", err);
    throw new HttpError(502, "MTN Mobile Money didn't accept the payment request. Check the number, or choose another way to pay.");
  }
  return row;
}

/** Marks a payment done and moves its orders on: paid → the shop sees them; failed → cancelled, stock back. */
async function finish(p: PaymentRow, status: "successful" | "failed" | "expired", reason: string | null, txnId: string | null = null) {
  const [updated] = await db
    .update(payments)
    .set({ status, failureReason: reason, providerTxnId: txnId, completedAt: new Date(), lastCheckedAt: new Date() })
    .where(and(eq(payments.id, p.id), eq(payments.status, "pending")))
    .returning();
  if (!updated) return; // someone else already finished it
  if (p.sourcingId) return finishSourcing(p, status, reason);
  const linked = await db.select().from(orders).where(eq(orders.paymentId, p.id));
  for (const o of linked) {
    if (o.status !== "awaiting_payment") continue;
    if (status === "successful") {
      await db.update(orders).set({ status: "placed", paymentStatus: "paid", paidAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, o.id));
      await db.insert(orderEvents).values({ orderId: o.id, status: "placed", byUserId: p.buyerId, note: "Paid with MTN Mobile Money" });
      const [shop] = await db.select({ ownerId: shops.ownerId }).from(shops).where(eq(shops.id, o.shopId)).limit(1);
      notify([shop?.ownerId], { type: "order", title: `New order ${orderNumber(o.number ?? 0)} (paid)`, body: "Paid with MTN Mobile Money — accept it so the rider can come.", link: "/sell/orders" });
    } else {
      await moveOrder(o.id, ["awaiting_payment"], "cancelled", p.buyerId, {
        note: status === "expired" ? "The payment wasn't approved in time" : `Payment failed${reason ? `: ${reason}` : ""}`,
        cancelledBy: "buyer",
        extra: { paymentStatus: "failed" },
      });
    }
  }
}

/** A China request: paid → accepted and YanaBuy orders it; failed → stays quoted so the buyer can try again. */
async function finishSourcing(p: PaymentRow, status: "successful" | "failed" | "expired", reason: string | null) {
  const id = p.sourcingId!;
  if (status === "successful") {
    const [done] = await db
      .update(sourcingRequests)
      .set({ status: "accepted", paymentStatus: "paid", paidAt: new Date(), updatedAt: new Date() })
      .where(and(eq(sourcingRequests.id, id), eq(sourcingRequests.status, "quoted")))
      .returning({ id: sourcingRequests.id });
    if (done) await db.insert(sourcingEvents).values({ requestId: id, status: "accepted", byUserId: p.buyerId, note: "Paid with MTN Mobile Money" });
  } else {
    await db
      .insert(sourcingEvents)
      .values({ requestId: id, status: "payment_failed", byUserId: p.buyerId, note: status === "expired" ? "Payment not approved in time" : (reason ?? "Payment declined") });
  }
}

/** Asks MTN how a pending payment is doing (at most every 3 seconds). */
export async function refreshPayment(p: PaymentRow) {
  if (p.status !== "pending") return p;
  if (p.lastCheckedAt && Date.now() - p.lastCheckedAt.getTime() < 3000) return p;
  if (Date.now() - p.createdAt.getTime() > EXPIRE_MS) {
    await finish(p, "expired", "Not approved within 10 minutes");
  } else {
    try {
      const s = await paymentStatus(p.providerRef);
      if (s.status === "SUCCESSFUL") await finish(p, "successful", null, s.transactionId);
      else if (s.status === "FAILED") await finish(p, "failed", s.reason ?? "Declined");
      else await db.update(payments).set({ lastCheckedAt: new Date() }).where(eq(payments.id, p.id));
    } catch (err) {
      console.error("MTN status check failed:", err);
    }
  }
  const [fresh] = await db.select().from(payments).where(eq(payments.id, p.id));
  return fresh;
}

/** Every minute, look at payments the buyer may have walked away from. */
export function startPaymentSweeper() {
  return setInterval(async () => {
    try {
      const stale = await db
        .select()
        .from(payments)
        .where(and(eq(payments.status, "pending"), lt(payments.createdAt, new Date(Date.now() - 30_000))))
        .limit(50);
      for (const p of stale) await refreshPayment(p);
    } catch (err) {
      console.error("Payment sweeper:", err);
    }
  }, 60_000).unref();
}
