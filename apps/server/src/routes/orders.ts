import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray, isNull, gte, or, sql, desc } from "drizzle-orm";
import { countryName, variantLabel, type Country, type PaymentMethod, type Quote, type QuoteLine, type QuoteShop } from "@yanabuy/shared";
import { db } from "../db/client";
import { categories, discountCodes, discountRedemptions, disputes, orderEvents, orderItems, orders, products, shops, users } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { activeAreas, feeFor, getDelivery, methodOn } from "../lib/delivery";
import { countryOf } from "../lib/country";
import { evaluateCode, lockCode, splitDiscount } from "../lib/discounts";
import { liveProduct, productCard, productColumns } from "../lib/products";
import { addEvent, loadOrder, moveOrder, summaries, takeVariantStock } from "../lib/orders";
import { forBuyer } from "../lib/disputes";
import { imageUrl } from "../lib/validation";
import { DISPUTE_DAYS, DISPUTE_REASON_LABEL, orderNumber } from "@yanabuy/shared";
import { paymentOut, refreshPayment, startPayment } from "../lib/payments";
import { payments } from "../db/schema";
import { optionalText, phone, requiredText } from "../lib/validation";
import { notify, notifyAdmins } from "../lib/notify";
import { optionalAuth, requireAuth, requireEmail } from "../middleware/auth";

/** Shopping: prices for a cart, checkout, and the buyer's own orders. */
export const ordersRouter = Router();


ordersRouter.use(requireAuth);

const itemsSchema = z
  .array(
    z.object({
      productId: z.string().uuid("Something in your cart isn't valid any more"),
      variantId: z.string().max(64).nullish().transform((v) => v ?? null),
      quantity: z.number().int().min(1, "Quantity must be at least 1").max(99, "You can order up to 99 of one item"),
    }),
    { required_error: "Your cart is empty" }
  )
  .min(1, "Your cart is empty")
  .max(50, "That's too many different items for one order");

type Items = z.infer<typeof itemsSchema>;

/** Today's prices and stock for a cart, split by shop — the server never trusts prices sent by the app. */
async function buildQuote(items: Items, buyerId: string | null, opts: { areaId?: string | null; code?: string | null; country?: Country } = {}): Promise<Quote> {
  const country = opts.country ?? "LR";
  // Same product (and same choice) twice → add the quantities up.
  const merged = new Map<string, { productId: string; variantId: string | null; quantity: number }>();
  for (const i of items) {
    const k = `${i.productId}:${i.variantId ?? ""}`;
    const prev = merged.get(k);
    merged.set(k, { productId: i.productId, variantId: i.variantId, quantity: Math.min(99, (prev?.quantity ?? 0) + i.quantity) });
  }
  const productIds = [...new Set([...merged.values()].map((m) => m.productId))];

  const rows = await db
    .select(productColumns)
    .from(products)
    .innerJoin(shops, eq(shops.id, products.shopId))
    .innerJoin(users, eq(users.id, shops.ownerId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(inArray(products.id, productIds), liveProduct));
  const byId = new Map(rows.map((r) => [r.product.id, r]));

  const lines: QuoteLine[] = [...merged.values()].map(({ productId, variantId, quantity }) => {
    const row = byId.get(productId);
    const gone = { productId, variantId, variantLabel: null, unitPrice: 0, quantity, product: null, available: 0, lineTotal: 0 };
    if (!row) return { ...gone, problem: "This item isn't on sale any more" };
    const p = row.product;
    const card = productCard(row);
    let unitPrice = p.price;
    let available = p.stock;
    let label: string | null = null;
    let problem: string | null = null;
    if (p.variants.length) {
      const v = p.variants.find((x) => x.id === variantId);
      if (!v) return { ...gone, variantId, product: card, problem: variantId ? "That choice isn't available any more — pick again" : "Choose an option (e.g. colour or size)" };
      unitPrice = v.price;
      available = v.stock;
      label = variantLabel(v.values);
      if (v.image) card.image = v.image;
    } else if (variantId) {
      return { ...gone, product: card, problem: "This item has no options any more — remove it and add it again" };
    }
    if (row.shop.country !== country) problem = `This is from a shop in ${countryName(row.shop.country)} — switch to ${countryName(row.shop.country)} to buy it`;
    else if (row.shop.ownerId === buyerId) problem = "You can't buy from your own shop";
    else if (available === 0) problem = "Sold out";
    else if (available !== null && quantity > available) problem = `Only ${available} left`;
    return { productId, variantId: p.variants.length ? variantId : null, variantLabel: label, unitPrice, quantity, product: card, available, lineTotal: unitPrice * quantity, problem };
  });

  const settings = await getDelivery();
  const areas = activeAreas(settings, country);
  const areaId = opts.areaId && areas.some((a) => a.id === opts.areaId) ? opts.areaId : null;
  const shopMap = new Map<string, QuoteShop & { kind: "goods" | "food" }>();
  for (const l of lines) {
    if (!l.product || l.problem) continue;
    const s = shopMap.get(l.product.shop.id) ?? { shop: l.product.shop, subtotal: 0, deliveryFee: 0, discount: 0, kind: l.product.kind };
    s.subtotal += l.lineTotal;
    shopMap.set(s.shop.id, s);
  }
  const withFees = [...shopMap.values()].map((s) => ({ ...s, deliveryFee: feeFor(s.subtotal, settings, areaId, country) }));
  const subtotal = withFees.reduce((n, s) => n + s.subtotal, 0);
  const deliveryFees = withFees.reduce((n, s) => n + s.deliveryFee, 0);

  // Discount code: money off the items, paid by YanaBuy, shared out across the shops' orders.
  let discount = 0;
  let discountCode: string | null = null;
  let discountProblem: string | null = null;
  if (opts.code?.trim()) {
    const eligible = { goods: 0, food: 0 };
    for (const s of withFees) eligible[s.kind] += s.subtotal;
    const result = await evaluateCode(opts.code, eligible, buyerId);
    if (result.problem !== null) discountProblem = result.problem;
    else {
      discount = result.amount;
      discountCode = result.row.code;
      const mode = result.row.mode;
      const shares = splitDiscount(
        discount,
        withFees.map((s) => (mode === "all" || mode === s.kind ? s.subtotal : 0))
      );
      withFees.forEach((s, i) => (s.discount = shares[i]));
    }
  }
  const shopsList: QuoteShop[] = withFees.map(({ kind: _kind, ...s }) => s);
  return {
    lines,
    shops: shopsList,
    subtotal,
    deliveryFees,
    discount,
    discountCode,
    discountProblem,
    total: subtotal + deliveryFees - discount,
    areas,
    areaId,
    country,
    paymentMethods: (Object.keys(settings.methods) as PaymentMethod[]).map((method) => ({ method, enabled: methodOn(settings, method, country) })),
    ok: lines.length > 0 && lines.every((l) => !l.problem),
  };
}


/** Anyone can price a cart — guests too — so the cart page works before logging in. */
export const quoteRouter = Router();
quoteRouter.post("/", optionalAuth, async (req, res) => {
  const { items, areaId, code } = parse(
    z.object({ items: itemsSchema, areaId: z.string().max(40).nullish(), code: z.string().max(40).nullish() }),
    req.body
  );
  res.json({ quote: await buildQuote(items, req.user?.id ?? null, { areaId, code, country: countryOf(req) }) });
});

const checkoutSchema = z.object({
  items: itemsSchema,
  delivery: z.object({
    name: requiredText(2, 80, "Name"),
    phone,
    city: requiredText(2, 60, "City"),
    address: requiredText(3, 200, "Address"),
    note: optionalText(300, "Note"),
    areaId: z.string().max(40).nullish(),
  }),
  /** A discount code typed at checkout. */
  code: z.string().max(40).nullish(),
  paymentMethod: z.enum(["cod", "mtn_momo", "orange_money", "card"]),
  /** The mobile money number that pays (defaults to the delivery phone). */
  paymentPhone: phone.optional(),
});

/** Places one order per shop. Stock is taken in the same transaction, so two people can't buy the last one. */
ordersRouter.post("/", requireEmail, async (req, res) => {
  const input = parse(checkoutSchema, req.body);
  const country = countryOf(req);
  const quote = await buildQuote(input.items, req.user!.id, { areaId: input.delivery.areaId, code: input.code, country });
  const settings = await getDelivery();
  if (quote.areas.length && !quote.areaId) {
    throw new HttpError(400, "Choose your delivery area", { "delivery.areaId": "Choose your area" });
  }
  if (input.code?.trim() && quote.discountProblem) {
    throw new HttpError(409, `Discount code: ${quote.discountProblem}`, { code: quote.discountProblem });
  }
  const areaName = quote.areas.find((a) => a.id === quote.areaId)?.name ?? null;
  if (!methodOn(settings, input.paymentMethod, country)) {
    throw new HttpError(400, "That way of paying isn't available yet — choose cash on delivery", { paymentMethod: "Not available yet" });
  }
  if (!quote.ok) {
    const bad = quote.lines.find((l) => l.problem)!;
    throw new HttpError(409, `${bad.product?.name ?? "An item"}: ${bad.problem}. Check your cart.`, { cart: "changed" });
  }

  const online = input.paymentMethod !== "cod";
  if (online && !(input.paymentPhone ?? input.delivery.phone).startsWith("+231")) {
    throw new HttpError(400, "Mobile money needs a Liberian number", { paymentPhone: "Enter a Liberian mobile money number" });
  }
  const ids = await db.transaction(async (tx) => {
    const created: string[] = [];
    // Check the code again with its row locked, so a limited code can't be used twice at the same moment.
    let codeId: string | null = null;
    if (quote.discountCode) {
      const locked = await lockCode(tx, quote.discountCode, req.user!.id);
      if (typeof locked === "string") throw new HttpError(409, `Discount code: ${locked}`, { code: locked });
      codeId = locked.id;
    }
    for (const s of quote.shops) {
      const lines = quote.lines.filter((l) => l.product!.shop.id === s.shop.id);
      for (const l of lines) {
        const soldOut = () => new HttpError(409, `${l.product!.name}: someone just bought the last ones. Check your cart.`, { cart: "changed" });
        if (l.variantId) {
          await takeVariantStock(tx, l.productId, l.variantId, l.quantity).catch(() => {
            throw soldOut();
          });
          continue;
        }
        const [ok] = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${l.quantity}` })
          .where(and(eq(products.id, l.productId), or(isNull(products.stock), gte(products.stock, l.quantity))))
          .returning({ id: products.id });
        if (!ok) throw soldOut();
      }
      const [order] = await tx
        .insert(orders)
        .values({
          buyerId: req.user!.id,
          shopId: s.shop.id,
          kind: lines[0].product!.kind,
          paymentMethod: input.paymentMethod,
          subtotal: s.subtotal,
          deliveryFee: s.deliveryFee,
          total: s.subtotal + s.deliveryFee - s.discount,
          discount: s.discount,
          discountCode: s.discount ? quote.discountCode : null,
          deliveryArea: areaName,
          country,
          deliveryName: input.delivery.name,
          deliveryPhone: input.delivery.phone,
          deliveryCity: input.delivery.city,
          deliveryAddress: input.delivery.address,
          note: input.delivery.note,
          // Mobile money: the shop only sees the order once it's paid.
          status: online ? "awaiting_payment" : "placed",
        })
        .returning({ id: orders.id });
      await tx.insert(orderItems).values(
        lines.map((l) => ({
          orderId: order.id,
          productId: l.productId,
          variantId: l.variantId,
          variantLabel: l.variantLabel,
          name: l.product!.name,
          image: l.product!.image,
          price: l.unitPrice,
          quantity: l.quantity,
        }))
      );
      await tx.insert(orderEvents).values({ orderId: order.id, status: online ? "awaiting_payment" : "placed", byUserId: req.user!.id });
      created.push(order.id);
    }
    if (codeId && quote.discount) {
      await tx.update(discountCodes).set({ timesUsed: sql`${discountCodes.timesUsed} + 1`, updatedAt: new Date() }).where(eq(discountCodes.id, codeId));
      await tx.insert(discountRedemptions).values({ codeId, userId: req.user!.id, amount: quote.discount, orderIds: created });
    }
    return created;
  });

  let payment = null;
  if (online) {
    const row = await startPayment({
      buyerId: req.user!.id,
      method: input.paymentMethod,
      amount: quote.total,
      phone: input.paymentPhone ?? input.delivery.phone,
      orderIds: ids,
      label: `YanaBuy order ${ids.length > 1 ? `(${ids.length} shops)` : ""}`.trim(),
    });
    payment = await paymentOut(row);
  }

  const placed = await Promise.all(ids.map((id) => loadOrder(id).then((r) => r.order)));
  // Cash on delivery: the shops can start now. (Mobile money: they hear once it's paid.)
  if (!online) {
    for (const o of placed) notify([await shopOwner(o.shop.id)], { type: "order", title: `New order ${o.number}`, body: `${o.itemCount} ${o.itemCount === 1 ? "item" : "items"} · cash on delivery`, link: "/sell/orders" });
  }
  res.status(201).json({ orders: placed, payment });
});

/** The delivery details from the buyer's last order, to fill the checkout form. */
ordersRouter.get("/last-delivery", async (req, res) => {
  const [last] = await db.select().from(orders).where(eq(orders.buyerId, req.user!.id)).orderBy(desc(orders.createdAt)).limit(1);
  res.json({
    delivery: last
      ? { name: last.deliveryName, phone: last.deliveryPhone, city: last.deliveryCity, address: last.deliveryAddress, note: null, area: last.deliveryArea }
      : null,
  });
});

ordersRouter.get("/", async (req, res) => {
  const { page } = parse(z.object({ page: z.coerce.number().int().min(1).default(1) }), req.query);
  res.json({ items: await summaries(eq(orders.buyerId, req.user!.id), { limit: 20, offset: (page - 1) * 20 }) });
});

/** How a mobile money payment is doing. The app asks every few seconds while the buyer approves it. */
ordersRouter.get("/payments/:id", async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) throw new HttpError(404, "Payment not found");
  const [row] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, req.params.id), eq(payments.buyerId, req.user!.id)))
    .limit(1);
  if (!row) throw new HttpError(404, "Payment not found");
  res.json({ payment: await paymentOut(await refreshPayment(row)) });
});

ordersRouter.get("/:id", async (req, res) => {
  const { order } = await loadOrder(req.params.id, eq(orders.buyerId, req.user!.id));
  res.json({ order: forBuyer(order) });
});

/** Buyers can cancel until the shop accepts. */
ordersRouter.post("/:id/cancel", async (req, res) => {
  const { reason } = parse(z.object({ reason: optionalText(300, "Reason") }), req.body ?? {});
  await loadOrder(req.params.id, eq(orders.buyerId, req.user!.id));
  await moveOrder(req.params.id, ["placed"], "cancelled", req.user!.id, { note: reason ?? "Cancelled by the buyer", cancelledBy: "buyer" }).catch((err) => {
    if (err instanceof HttpError && err.status === 409) throw new HttpError(409, "The shop has already accepted this order, so it can't be cancelled here. Call the shop.");
    throw err;
  });
  res.json({ order: forBuyer((await loadOrder(req.params.id)).order) });
});

const disputeSchema = z.object({
  reason: z.enum(["not_received", "wrong_item", "damaged", "not_as_described", "missing_items", "other"], {
    errorMap: () => ({ message: "Choose what went wrong" }),
  }),
  description: requiredText(10, 1000, "What happened"),
  photos: z.array(imageUrl).max(6, "You can add up to 6 photos").default([]),
});

/** The buyer reports a problem with a delivered order (within a few days of delivery). */
ordersRouter.post("/:id/dispute", async (req, res) => {
  const input = parse(disputeSchema, req.body);
  const { row } = await loadOrder(req.params.id, eq(orders.buyerId, req.user!.id));
  const o = row.order;
  if (o.status !== "delivered" || !o.deliveredAt) throw new HttpError(409, "You can report a problem once the order is delivered");
  if (Date.now() - o.deliveredAt.getTime() > DISPUTE_DAYS * 86400_000) {
    throw new HttpError(409, `Problems can be reported up to ${DISPUTE_DAYS} days after delivery. Please contact YanaBuy support.`);
  }
  const [existing] = await db.select({ id: disputes.id }).from(disputes).where(eq(disputes.orderId, o.id)).limit(1);
  if (existing) throw new HttpError(409, "You've already reported a problem with this order");
  await db.insert(disputes).values({ orderId: o.id, buyerId: o.buyerId, shopId: o.shopId, ...input });
  await addEvent(o.id, "dispute_opened", req.user!.id, DISPUTE_REASON_LABEL[input.reason]);
  notify([await shopOwner(o.shopId)], { type: "dispute", title: `A buyer reported a problem with ${orderNumber(o.number ?? 0)}`, body: DISPUTE_REASON_LABEL[input.reason], link: "/sell/orders" });
  notifyAdmins({ title: `Problem reported on ${orderNumber(o.number ?? 0)}`, body: DISPUTE_REASON_LABEL[input.reason], path: "/disputes" });
  res.status(201).json({ order: forBuyer((await loadOrder(o.id)).order) });
});

async function shopOwner(shopId: string) {
  const [s] = await db.select({ ownerId: shops.ownerId }).from(shops).where(eq(shops.id, shopId)).limit(1);
  return s?.ownerId ?? null;
}
