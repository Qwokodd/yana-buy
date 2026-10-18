import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, gte, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { BookingStatus } from "@yanabuy/shared";
import { db } from "../db/client";
import { bookings, products, shops, users } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { bookingOut, lockShop, settingsOf, slotsFor, when } from "../lib/bookings";
import { notify } from "../lib/notify";
import { optionalText, phone, requiredText } from "../lib/validation";
import { requireAuth, requireEmail } from "../middleware/auth";

const buyer = alias(users, "booking_buyer");
const owner = alias(users, "booking_owner");

const select = () =>
  db
    .select({ b: bookings, shop: shops, buyer: { id: buyer.id, fullName: buyer.fullName, phone: buyer.phone, avatarUrl: buyer.avatarUrl } })
    .from(bookings)
    .innerJoin(shops, eq(shops.id, bookings.shopId))
    .innerJoin(buyer, eq(buyer.id, bookings.buyerId));

type Row = Awaited<ReturnType<ReturnType<typeof select>["limit"]>>[number];
const out = (r: Row) => bookingOut(r.b, r.shop, r.buyer);

async function loadOne(id: string, extra?: SQL) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Booking not found");
  const [r] = await select().where(and(eq(bookings.id, id), extra)).limit(1);
  if (!r) throw new HttpError(404, "Booking not found");
  return r;
}

// ─── Buyers ─────────────────────────────────────────────────────────────────

/** A buyer's own bookings. Mounted at /api/bookings. */
export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

const createSchema = z.object({
  shopId: z.string().uuid("Shop not found"),
  productId: z.string().uuid().nullish(),
  startsAt: z.string().datetime({ message: "Pick a time" }),
  partySize: z.number().int().min(1, "At least 1 person").max(100).nullish(),
  contactName: requiredText(2, 80, "Name"),
  contactPhone: phone,
  note: optionalText(300, "Note"),
});

bookingsRouter.post("/", requireEmail, async (req, res) => {
  const input = parse(createSchema, req.body);
  const [shop] = await db.select().from(shops).innerJoin(owner, eq(owner.id, shops.ownerId)).where(eq(shops.id, input.shopId)).limit(1);
  if (!shop || shop.shops.status !== "approved" || shop.booking_owner.status !== "active") throw new HttpError(404, "This shop isn't taking bookings right now");
  const s = settingsOf(shop.shops);
  if (!s.enabled) throw new HttpError(400, "This shop isn't taking bookings right now");
  if (shop.shops.ownerId === req.user!.id) throw new HttpError(400, "You can't book at your own shop");

  const kind = shop.shops.kind === "restaurant" ? ("table" as const) : ("service" as const);
  let product: { id: string; name: string; durationMinutes: number | null } | null = null;
  if (kind === "service") {
    if (!input.productId) throw new HttpError(400, "Choose the service you want to book", { productId: "Choose a service" });
    const [p] = await db
      .select({ id: products.id, name: products.name, durationMinutes: products.durationMinutes, bookable: products.bookable, status: products.status, hidden: products.hidden, shopId: products.shopId })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    if (!p || p.shopId !== shop.shops.id || !p.bookable || p.status !== "approved" || p.hidden) throw new HttpError(400, "That service can't be booked right now", { productId: "Not bookable" });
    product = p;
  } else {
    const size = input.partySize ?? 0;
    if (size < 1) throw new HttpError(400, "How many people?", { partySize: "How many people?" });
    if (size > s.maxPartySize) throw new HttpError(400, `For more than ${s.maxPartySize} people, please call the restaurant`, { partySize: `Up to ${s.maxPartySize}` });
  }
  const start = new Date(input.startsAt);
  const date = start.toISOString().slice(0, 10);
  const duration = product?.durationMinutes ?? s.slotMinutes;

  const created = await db.transaction(async (tx) => {
    await lockShop(tx, shop.shops.id);
    const slots = await slotsFor(shop.shops, date, duration, tx);
    const slot = slots.find((x) => x.startsAt === start.toISOString());
    if (!slot) throw new HttpError(409, "That time isn't available — pick another", { startsAt: "Not available" });
    if (slot.left < 1) throw new HttpError(409, "Someone just took that time — pick another", { startsAt: "Just taken" });
    const [b] = await tx
      .insert(bookings)
      .values({
        shopId: shop.shops.id,
        buyerId: req.user!.id,
        productId: product?.id ?? null,
        productName: product?.name ?? null,
        kind,
        startsAt: start,
        durationMinutes: duration,
        partySize: kind === "table" ? input.partySize! : null,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        note: input.note,
      })
      .returning();
    return b;
  });
  const r = await loadOne(created.id);
  notify([shop.shops.ownerId], {
    type: "booking",
    title: `New booking request ${out(r).number}`,
    body: `${kind === "table" ? `Table for ${created.partySize}` : product!.name} · ${when(created.startsAt)} · ${created.contactName}`,
    link: "/sell/bookings",
  });
  res.status(201).json({ booking: out(r) });
});

bookingsRouter.get("/", async (req, res) => {
  const rows = await select().where(eq(bookings.buyerId, req.user!.id)).orderBy(desc(bookings.startsAt)).limit(100);
  res.json({ items: rows.map(out) });
});

bookingsRouter.get("/:id", async (req, res) => {
  res.json({ booking: out(await loadOne(req.params.id, eq(bookings.buyerId, req.user!.id))) });
});

bookingsRouter.post("/:id/cancel", async (req, res) => {
  const { reason } = parse(z.object({ reason: optionalText(300, "Reason") }), req.body ?? {});
  const r = await loadOne(req.params.id, eq(bookings.buyerId, req.user!.id));
  if (!["requested", "confirmed"].includes(r.b.status)) throw new HttpError(409, "This booking can't be cancelled any more");
  await db.update(bookings).set({ status: "cancelled", statusNote: reason ?? "Cancelled by the buyer", updatedAt: new Date() }).where(eq(bookings.id, r.b.id));
  const fresh = await loadOne(r.b.id);
  notify([r.shop.ownerId], { type: "booking", title: `${out(fresh).number} was cancelled`, body: `${r.b.contactName} · ${when(r.b.startsAt)}${reason ? ` — ${reason}` : ""}`, link: "/sell/bookings" });
  res.json({ booking: out(fresh) });
});

// ─── Shops ──────────────────────────────────────────────────────────────────

/** The shop's bookings and booking settings. Mounted at /api/shop/bookings. */
export const shopBookingsRouter = Router();
shopBookingsRouter.use(requireAuth);

async function myShop(userId: string) {
  const [shop] = await db.select().from(shops).where(eq(shops.ownerId, userId)).limit(1);
  if (!shop) throw new HttpError(404, "Open a shop first");
  return shop;
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:00");
const settingsSchema = z
  .object({
    enabled: z.boolean(),
    days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day").max(7),
    opens: hhmm,
    closes: hhmm,
    slotMinutes: z.number().int().refine((v) => [15, 30, 45, 60, 90, 120].includes(v), "Pick 15, 30, 45, 60, 90 or 120 minutes"),
    perSlot: z.number().int().min(1, "At least 1").max(200),
    maxPartySize: z.number().int().min(1).max(100),
    leadHours: z.number().int().min(0).max(168),
    daysAhead: z.number().int().min(1).max(120),
    note: optionalText(300, "Note"),
  })
  .strict()
  .refine((v) => v.closes > v.opens, { path: ["closes"], message: "Closing time must be after opening time" });

shopBookingsRouter.get("/settings", async (req, res) => {
  res.json({ settings: settingsOf(await myShop(req.user!.id)) });
});

shopBookingsRouter.put("/settings", async (req, res) => {
  const shop = await myShop(req.user!.id);
  if (shop.status !== "approved") throw new HttpError(400, "You can take bookings once your shop is approved");
  const settings = parse(settingsSchema, req.body);
  await db.update(shops).set({ bookingSettings: { ...settings, note: settings.note ?? null }, updatedAt: new Date() }).where(eq(shops.id, shop.id));
  res.json({ settings: settingsOf({ ...shop, bookingSettings: { ...settings, note: settings.note ?? null } }) });
});

shopBookingsRouter.get("/", async (req, res) => {
  const shop = await myShop(req.user!.id);
  const { view } = parse(z.object({ view: z.enum(["upcoming", "requests", "past", "all"]).default("upcoming") }), req.query);
  const now = new Date(Date.now() - 3 * 3600_000);
  const where =
    view === "requests"
      ? and(eq(bookings.shopId, shop.id), eq(bookings.status, "requested"))
      : view === "upcoming"
        ? and(eq(bookings.shopId, shop.id), inArray(bookings.status, ["requested", "confirmed"]), gte(bookings.startsAt, now))
        : view === "past"
          ? and(eq(bookings.shopId, shop.id), inArray(bookings.status, ["completed", "no_show", "declined", "cancelled"]))
          : eq(bookings.shopId, shop.id);
  const rows = await select()
    .where(where)
    .orderBy(view === "past" || view === "all" ? desc(bookings.startsAt) : bookings.startsAt)
    .limit(200);
  res.json({ items: rows.map(out) });
});

const STEP: Record<string, { from: BookingStatus[]; to: BookingStatus; title: (no: string) => string }> = {
  confirm: { from: ["requested"], to: "confirmed", title: (no) => `Booking ${no} is confirmed` },
  decline: { from: ["requested"], to: "declined", title: (no) => `Booking ${no} was declined` },
  complete: { from: ["confirmed"], to: "completed", title: (no) => `Thanks for visiting — ${no} is done` },
  "no-show": { from: ["confirmed"], to: "no_show", title: (no) => `${no} was marked as missed` },
  cancel: { from: ["requested", "confirmed"], to: "cancelled", title: (no) => `The shop cancelled booking ${no}` },
};

shopBookingsRouter.post("/:id/:step", async (req, res) => {
  const step = STEP[req.params.step];
  if (!step) throw new HttpError(404, "Unknown step");
  const { reason } = parse(z.object({ reason: optionalText(300, "Reason") }), req.body ?? {});
  if ((req.params.step === "decline" || req.params.step === "cancel") && !reason) throw new HttpError(400, "Tell the customer why (they'll see it)", { reason: "Write a short reason" });
  const shop = await myShop(req.user!.id);
  const r = await loadOne(req.params.id, eq(bookings.shopId, shop.id));
  if (!step.from.includes(r.b.status)) throw new HttpError(409, `This booking is already ${r.b.status.replace("_", " ")}. Reload to see the latest.`);
  await db.update(bookings).set({ status: step.to, statusNote: reason ?? null, respondedAt: new Date(), updatedAt: new Date() }).where(eq(bookings.id, r.b.id));
  const fresh = out(await loadOne(r.b.id));
  notify([r.b.buyerId], {
    type: "booking",
    title: step.title(fresh.number),
    body: `${shop.name} · ${when(r.b.startsAt)}${reason ? ` — ${reason}` : ""}`,
    link: `/bookings/${r.b.id}`,
  });
  res.json({ booking: fresh });
});

// ─── Admin ──────────────────────────────────────────────────────────────────

/** Read-only list for admins. Mounted under /api/admin. */
export const adminBookingsRouter = Router();
adminBookingsRouter.get("/bookings", async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(["requested", "confirmed", "declined", "cancelled", "completed", "no_show"]).optional() }), req.query);
  const rows = await select()
    .where(status ? eq(bookings.status, status) : undefined)
    .orderBy(desc(bookings.createdAt))
    .limit(200);
  res.json({ items: rows.map(out) });
});
