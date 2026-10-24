import { Router } from "express";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { momoTransfers, payments } from "../db/schema";
import { refreshPayment } from "../lib/payments";
import { refreshTransfer } from "../lib/payments/transfers";

/**
 * MTN MoMo calls this when a payment (Collections) or payout (Disbursements) finishes:
 *   https://api.yanabuy.com/api/payments/mtn/callback
 * We never trust what the message says — anyone could send one. We only use it as a nudge to
 * ask MTN ourselves straight away, instead of waiting for the next one-minute check.
 * Mounted under /api/payments.
 */
export const paymentCallbacksRouter = Router();

const isUuid = (v: unknown): v is string => z.string().uuid().safeParse(v).success;

async function nudge(body: unknown, headerRef: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const ids = [b.externalId, b.referenceId, headerRef].filter(isUuid);
  for (const id of new Set(ids)) {
    const [p] = await db.select().from(payments).where(or(eq(payments.id, id), eq(payments.providerRef, id))).limit(1);
    if (p) {
      // Let the 3-second guard pass so MTN's answer is fetched now.
      await refreshPayment({ ...p, lastCheckedAt: null });
      continue;
    }
    const [t] = await db.select({ id: momoTransfers.id }).from(momoTransfers).where(or(eq(momoTransfers.id, id), eq(momoTransfers.providerRef, id))).limit(1);
    if (t) await refreshTransfer(t.id);
  }
}

const handle = async (req: import("express").Request, res: import("express").Response) => {
  // Always answer 200 quickly so MTN doesn't keep retrying; the work happens after.
  res.status(200).json({ ok: true });
  void nudge(req.body, req.get("x-reference-id")).catch((err) => console.error("MTN callback:", err));
};
paymentCallbacksRouter.post("/mtn/callback", handle);
paymentCallbacksRouter.put("/mtn/callback", handle);
