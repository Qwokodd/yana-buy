import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { SOURCING_STATUS_LABEL, formatLD, type SourcingStatus } from "@yanabuy/shared";
import { db } from "../db/client";
import { payments, sourcingRequests } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { loadSourcing, sourcingEvent, sourcingOut } from "../lib/sourcing";
import { optionalText } from "../lib/validation";

/** China sourcing requests. Mounted under /api/admin. */
export const adminSourcingRouter = Router();

const OPEN: SourcingStatus[] = ["pending", "quoted", "accepted", "ordered", "shipped", "arrived"];
const DONE: SourcingStatus[] = ["delivered", "rejected", "cancelled"];

adminSourcingRouter.get("/sourcing", async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(["open", "done", "all"]).default("open") }), req.query);
  const rows = await db
    .select()
    .from(sourcingRequests)
    .where(status === "all" ? undefined : inArray(sourcingRequests.status, status === "open" ? OPEN : DONE))
    .orderBy(status === "open" ? asc(sourcingRequests.createdAt) : desc(sourcingRequests.updatedAt))
    .limit(200);
  res.json({ items: await Promise.all(rows.map((r) => sourcingOut(r, { withBuyer: true }))) });
});

adminSourcingRouter.get("/sourcing/:id", async (req, res) => {
  res.json({ request: await sourcingOut(await loadSourcing(String(req.params.id)), { withBuyer: true }) });
});

const quoteSchema = z.object({
  price: z
    .number({ required_error: "Enter the price", invalid_type_error: "Enter the price" })
    .int()
    .min(100, "Enter the price")
    .max(1_000_000_000, "That price is too high"),
  days: z
    .number({ required_error: "Enter the delivery time", invalid_type_error: "Enter the delivery time" })
    .int("Whole days")
    .min(1, "At least 1 day")
    .max(180, "At most 180 days"),
  note: optionalText(1000, "Note"),
});

/** Sends (or changes) the quote: the landed price for everything. */
adminSourcingRouter.post("/sourcing/:id/quote", async (req, res) => {
  const input = parse(quoteSchema, req.body);
  const r = await loadSourcing(String(req.params.id));
  if (r.status !== "pending" && r.status !== "quoted") throw new HttpError(409, "The buyer has already accepted, or the request is closed");
  const [paying] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.sourcingId, r.id), eq(payments.status, "pending")))
    .limit(1);
  if (paying) throw new HttpError(409, "The buyer is paying the current quote right now. Try again in a few minutes.");
  const [updated] = await db
    .update(sourcingRequests)
    .set({ status: "quoted", quotePrice: input.price, quoteDays: input.days, quoteNote: input.note, quotedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(sourcingRequests.id, r.id), inArray(sourcingRequests.status, ["pending", "quoted"])))
    .returning();
  if (!updated) throw new HttpError(409, "The request changed — refresh and try again");
  await sourcingEvent(r.id, "quoted", req.user!.id, `${formatLD(input.price)} · about ${input.days} days`);
  await audit(req.user!.id, "sourcing.quote", { type: "sourcing", id: r.id }, { number: `CS-${r.number}`, price: input.price, days: input.days });
  res.json({ request: await sourcingOut(updated, { withBuyer: true }) });
});

adminSourcingRouter.post("/sourcing/:id/reject", async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string({ required_error: "Tell the buyer why" }).trim().min(3, "Tell the buyer why").max(500) }), req.body);
  const r = await loadSourcing(String(req.params.id));
  const [updated] = await db
    .update(sourcingRequests)
    .set({ status: "rejected", rejectReason: reason, updatedAt: new Date() })
    .where(and(eq(sourcingRequests.id, r.id), inArray(sourcingRequests.status, ["pending", "quoted"])))
    .returning();
  if (!updated) throw new HttpError(409, "Only requests that aren't accepted yet can be turned down");
  await sourcingEvent(r.id, "rejected", req.user!.id, reason);
  await audit(req.user!.id, "sourcing.reject", { type: "sourcing", id: r.id }, { number: `CS-${r.number}`, reason });
  res.json({ request: await sourcingOut(updated, { withBuyer: true }) });
});

/** Each step can only follow the one before it. */
const NEXT: Partial<Record<SourcingStatus, SourcingStatus>> = { accepted: "ordered", ordered: "shipped", shipped: "arrived", arrived: "delivered" };

adminSourcingRouter.post("/sourcing/:id/status", async (req, res) => {
  const { status, note } = parse(z.object({ status: z.enum(["ordered", "shipped", "arrived", "delivered"]), note: optionalText(500, "Note") }), req.body);
  const r = await loadSourcing(String(req.params.id));
  if (NEXT[r.status] !== status) {
    throw new HttpError(409, `This request is "${SOURCING_STATUS_LABEL[r.status]}", so it can't be marked "${SOURCING_STATUS_LABEL[status]}" now`);
  }
  // Delivered with pay-on-delivery means the cash was collected.
  const paidNow = status === "delivered" && r.paymentStatus !== "paid";
  const [updated] = await db
    .update(sourcingRequests)
    .set({ status, updatedAt: new Date(), ...(paidNow ? { paymentStatus: "paid" as const, paidAt: new Date() } : {}) })
    .where(and(eq(sourcingRequests.id, r.id), eq(sourcingRequests.status, r.status)))
    .returning();
  if (!updated) throw new HttpError(409, "The request changed — refresh and try again");
  await sourcingEvent(r.id, status, req.user!.id, note);
  await audit(req.user!.id, "sourcing.status", { type: "sourcing", id: r.id }, { number: `CS-${r.number}`, status });
  res.json({ request: await sourcingOut(updated, { withBuyer: true }) });
});
