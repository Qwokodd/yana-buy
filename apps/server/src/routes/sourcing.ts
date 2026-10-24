import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { payments, sourcingRequests } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { getDelivery } from "../lib/delivery";
import { paymentOut, startPayment } from "../lib/payments";
import { loadSourcing, sourcingEvent, sourcingOut } from "../lib/sourcing";
import { imageUrl, optionalText, phone, requiredText } from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import { notifyAdmins } from "../lib/notify";

/** "Buy it from China for me". Mounted at /api/sourcing. */
export const sourcingRouter = Router();
sourcingRouter.use(requireAuth);

const createSchema = z.object({
  link: z
    .string()
    .trim()
    .max(1000, "That link is too long")
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), "Paste the full link, starting with http"),
  description: requiredText(10, 2000, "Description"),
  quantity: z
    .number({ invalid_type_error: "Enter how many you want" })
    .int("Enter a whole number")
    .min(1, "At least 1")
    .max(10_000, "That's a lot — contact YanaBuy for bulk orders"),
  budget: optionalText(80, "Budget"),
  images: z.array(imageUrl).max(6, "You can add up to 6 photos").default([]),
});

async function mine(id: string, userId: string) {
  const r = await loadSourcing(id);
  if (r.buyerId !== userId) throw new HttpError(404, "Request not found");
  return r;
}

sourcingRouter.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(sourcingRequests)
    .where(eq(sourcingRequests.buyerId, req.user!.id))
    .orderBy(desc(sourcingRequests.createdAt))
    .limit(100);
  res.json({ items: await Promise.all(rows.map((r) => sourcingOut(r))) });
});

sourcingRouter.post("/", async (req, res) => {
  const input = parse(createSchema, req.body);
  if (!input.link && !input.images.length) {
    throw new HttpError(400, "Add a link or at least one photo so we know what to look for", { link: "Add a link or a photo" });
  }
  const open = await db
    .select({ id: sourcingRequests.id })
    .from(sourcingRequests)
    .where(and(eq(sourcingRequests.buyerId, req.user!.id), inArray(sourcingRequests.status, ["pending", "quoted"])));
  if (open.length >= 10) throw new HttpError(429, "You have 10 requests waiting already. Wait for those quotes first.");
  const [row] = await db
    .insert(sourcingRequests)
    .values({ buyerId: req.user!.id, ...input })
    .returning();
  await sourcingEvent(row.id, "pending", req.user!.id);
  notifyAdmins({ title: "New China request to quote", body: `From ${req.user!.fullName}`, path: "/sourcing" });
  res.status(201).json({ request: await sourcingOut(row) });
});

sourcingRouter.get("/:id", async (req, res) => {
  const settings = await getDelivery();
  // China orders are paid online first (mobile money / card, when switched on) — no cash on delivery.
  const payMethods = (["mtn_momo", "orange_money", "card"] as const).filter((m) => settings.methods[m]);
  res.json({ request: await sourcingOut(await mine(req.params.id, req.user!.id)), payMethods });
});

/** Buyers can cancel until they've accepted a quote. */
sourcingRouter.post("/:id/cancel", async (req, res) => {
  const r = await mine(req.params.id, req.user!.id);
  const [done] = await db
    .update(sourcingRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(sourcingRequests.id, r.id), inArray(sourcingRequests.status, ["pending", "quoted"])))
    .returning();
  if (!done) throw new HttpError(409, "This request can't be cancelled any more. Contact YanaBuy support.");
  await sourcingEvent(r.id, "cancelled", req.user!.id);
  res.json({ request: await sourcingOut(done) });
});

const acceptSchema = z.object({
  delivery: z.object({
    name: requiredText(2, 80, "Name"),
    phone,
    city: requiredText(2, 60, "City"),
    address: requiredText(3, 200, "Address"),
    note: optionalText(300, "Note"),
  }),
  paymentMethod: z.enum(["cod", "mtn_momo", "orange_money", "card"]),
  paymentPhone: phone.optional(),
});

/** Accepts the quote: pay now with mobile money, or pay when it's delivered. */
sourcingRouter.post("/:id/accept", async (req, res) => {
  const input = parse(acceptSchema, req.body);
  const r = await mine(req.params.id, req.user!.id);
  if (r.status !== "quoted" || !r.quotePrice) throw new HttpError(409, "There's no quote to accept on this request");
  const settings = await getDelivery();
  if (input.paymentMethod === "cod" || !settings.methods[input.paymentMethod]) {
    throw new HttpError(400, "That way of paying isn't available yet", { paymentMethod: "Not available yet" });
  }
  const pendingPay = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.sourcingId, r.id), eq(payments.status, "pending")))
    .limit(1);
  if (pendingPay.length) throw new HttpError(409, "A payment for this request is already waiting for approval on your phone");

  const d = input.delivery;
  await db
    .update(sourcingRequests)
    .set({
      deliveryName: d.name,
      deliveryPhone: d.phone,
      deliveryCity: d.city,
      deliveryAddress: d.address,
      paymentMethod: input.paymentMethod,
      updatedAt: new Date(),
    })
    .where(eq(sourcingRequests.id, r.id));

  // Paid online first; the request is accepted once the payment comes through.
  const row = await startPayment({
    buyerId: req.user!.id,
    method: input.paymentMethod,
    amount: r.quotePrice,
    phone: input.paymentPhone ?? d.phone,
    orderIds: [],
    sourcingId: r.id,
    label: `YanaBuy China order CS-${r.number}`,
  });
  const payment = await paymentOut(row);
  res.json({ request: await sourcingOut(await loadSourcing(r.id)), payment });
});
