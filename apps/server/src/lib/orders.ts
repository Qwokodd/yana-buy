import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { bookingNumber, DISPUTE_DAYS, orderNumber, type Order, type OrderStatus, type OrderSummary, type PersonContact } from "@yanabuy/shared";
import { db } from "../db/client";
import { bookings, disputes, orderEvents, orderItems, orders, products, reviews, shops, users, type OrderRow, type ShopRow, type UserRow } from "../db/schema";
import { HttpError } from "./http";
import { notify, notifyAdmins } from "./notify";
import { disputeOut } from "./disputes";
import { shopPoint } from "./locations";

export const buyer = alias(users, "order_buyer");
export const rider = alias(users, "order_rider");
export const offered = alias(users, "order_offered_rider");

type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const contact = (u: Pick<UserRow, "id" | "fullName" | "phone" | "avatarUrl"> | null): PersonContact | null =>
  u?.id ? { id: u.id, fullName: u.fullName, phone: u.phone, avatarUrl: u.avatarUrl } : null;

const selection = {
  order: orders,
  shop: shops,
  buyer: { id: buyer.id, fullName: buyer.fullName, phone: buyer.phone, avatarUrl: buyer.avatarUrl },
  rider: { id: rider.id, fullName: rider.fullName, phone: rider.phone, avatarUrl: rider.avatarUrl, lat: rider.lat, lng: rider.lng, locatedAt: rider.locatedAt },
  offered: { id: offered.id, fullName: offered.fullName, phone: offered.phone, avatarUrl: offered.avatarUrl },
};

export const selectOrders = () =>
  db
    .select(selection)
    .from(orders)
    .innerJoin(shops, eq(shops.id, orders.shopId))
    .innerJoin(buyer, eq(buyer.id, orders.buyerId))
    .leftJoin(rider, eq(rider.id, orders.riderId))
    .leftJoin(offered, eq(offered.id, orders.offeredRiderId));

type Loose = { id: string | null; fullName: string | null; phone: string | null; avatarUrl: string | null };
type Row = {
  order: OrderRow;
  shop: ShopRow;
  buyer: PersonContact;
  rider: (Loose & { lat: number | null; lng: number | null; locatedAt: Date | null }) | null;
  offered: Loose | null;
};

function summary(r: Row, items: { image: string | null; quantity: number }[], disputeStatus: OrderSummary["disputeStatus"] = null): OrderSummary {
  const o = r.order;
  return {
    id: o.id,
    number: orderNumber(o.number ?? 0),
    kind: o.kind,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    total: o.total,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    firstImage: items.find((i) => i.image)?.image ?? null,
    shop: { id: r.shop.id, name: r.shop.name, slug: r.shop.slug, kind: r.shop.kind, city: r.shop.city, logoUrl: r.shop.logoUrl, country: r.shop.country },
    createdAt: o.createdAt.toISOString(),
    rider: contact(r.rider as PersonContact | null),
    offer: r.offered?.id && o.offeredAt ? { rider: contact(r.offered as PersonContact)!, at: o.offeredAt.toISOString() } : null,
    disputeStatus,
    fulfilment: o.fulfilment,
    arriveAt: o.arriveAt?.toISOString() ?? null,
    partySize: o.partySize,
  };
}

/** Lists: one query for the orders, one for all their items. */
export async function summaries(where: SQL | undefined, opts: { limit: number; offset?: number; oldestFirst?: boolean }) {
  const rows = (await selectOrders()
    .where(where)
    .orderBy(opts.oldestFirst ? asc(orders.createdAt) : desc(orders.createdAt))
    .limit(opts.limit)
    .offset(opts.offset ?? 0)) as Row[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.order.id);
  const [items, probs] = await Promise.all([
    db
      .select({ orderId: orderItems.orderId, image: orderItems.image, quantity: orderItems.quantity })
      .from(orderItems)
      .where(inArray(orderItems.orderId, ids)),
    db.select({ orderId: disputes.orderId, status: disputes.status }).from(disputes).where(inArray(disputes.orderId, ids)),
  ]);
  return rows.map((r) =>
    summary(
      r,
      items.filter((i) => i.orderId === r.order.id),
      probs.find((d) => d.orderId === r.order.id)?.status ?? null
    )
  );
}

export async function loadOrder(id: string, extra?: SQL): Promise<{ row: Row; order: Order }> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Order not found");
  const [row] = (await selectOrders()
    .where(and(eq(orders.id, id), extra))
    .limit(1)) as Row[];
  if (!row) throw new HttpError(404, "Order not found");
  const [items, events, [dispute], reviewed, [booking]] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)),
    db
      .select({ status: orderEvents.status, note: orderEvents.note, createdAt: orderEvents.createdAt, by: users.fullName })
      .from(orderEvents)
      .leftJoin(users, eq(users.id, orderEvents.byUserId))
      .where(eq(orderEvents.orderId, id))
      .orderBy(asc(orderEvents.createdAt)),
    db.select().from(disputes).where(eq(disputes.orderId, id)).limit(1),
    db.select({ productId: reviews.productId }).from(reviews).where(eq(reviews.orderId, id)),
    row.order.bookingId ? db.select().from(bookings).where(eq(bookings.id, row.order.bookingId)).limit(1) : Promise.resolve([]),
  ]);
  const o = row.order;
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  const order: Order = {
    ...summary(row, items, dispute?.status ?? null),
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    deliveryFeeBreakdown: o.deliveryFeeBreakdown ?? null,
    discount: o.discount,
    discountCode: o.discountCode,
    items: items.map((i) => ({ id: i.id, productId: i.productId, variantId: i.variantId, variantLabel: i.variantLabel, name: i.name, image: i.image, price: i.price, quantity: i.quantity })),
    delivery: { name: o.deliveryName, phone: o.deliveryPhone, city: o.deliveryCity, address: o.deliveryAddress, note: o.note, area: o.deliveryArea, lat: o.deliveryLat, lng: o.deliveryLng },
    shop: {
      id: row.shop.id,
      name: row.shop.name,
      slug: row.shop.slug,
      kind: row.shop.kind,
      city: row.shop.city,
      logoUrl: row.shop.logoUrl,
      country: row.shop.country,
      phone: row.shop.phone,
      address: row.shop.address,
      location: await shopPoint(row.shop),
    },
    buyer: row.buyer,
    riderLocation:
      row.rider?.id && row.rider.lat != null && row.rider.lng != null && row.rider.locatedAt
        ? { lat: row.rider.lat, lng: row.rider.lng, at: row.rider.locatedAt.toISOString() }
        : null,
    declinedRiderIds: o.declinedRiderIds ?? [],
    cancelReason: o.cancelReason,
    cancelledBy: o.cancelledBy,
    events: events.map((e) => ({ status: e.status, note: e.note, createdAt: e.createdAt.toISOString(), by: e.by })),
    acceptedAt: iso(o.acceptedAt),
    readyAt: iso(o.readyAt),
    pickedUpAt: iso(o.pickedUpAt),
    deliveredAt: iso(o.deliveredAt),
    cancelledAt: iso(o.cancelledAt),
    dispute: dispute ? disputeOut(dispute) : null,
    reviewedProductIds: reviewed.map((r) => r.productId),
    disputeUntil:
      o.status === "delivered" && o.deliveredAt ? new Date(o.deliveredAt.getTime() + DISPUTE_DAYS * 86400_000).toISOString() : null,
    booking: booking
      ? { id: booking.id, number: bookingNumber(booking.number ?? 0), status: booking.status, startsAt: booking.startsAt.toISOString(), partySize: booking.partySize }
      : null,
  };
  return { row, order };
}

const STAMP: Partial<Record<OrderStatus, keyof OrderRow>> = {
  accepted: "acceptedAt",
  ready: "readyAt",
  picked_up: "pickedUpAt",
  delivered: "deliveredAt",
  cancelled: "cancelledAt",
};

/**
 * Moves an order to a new step, only from the steps allowed, in one
 * transaction with its timeline entry. Cancelling puts the stock back.
 */
export async function moveOrder(
  id: string,
  from: OrderStatus[],
  to: OrderStatus,
  byUserId: string,
  opts: { note?: string | null; cancelledBy?: "buyer" | "seller" | "admin"; extra?: Partial<OrderRow> } = {}
) {
  let previous: OrderStatus | null = null;
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(orders).where(eq(orders.id, id)).for("update").limit(1);
    if (!current) throw new HttpError(404, "Order not found");
    previous = current.status;
    if (!from.includes(current.status)) {
      throw new HttpError(409, `This order is already ${current.status.replace("_", " ")}. Reload to see the latest.`);
    }
    const now = new Date();
    const stamp = STAMP[to];
    await tx
      .update(orders)
      .set({
        status: to,
        ...(stamp ? { [stamp]: now } : {}),
        ...(to === "cancelled" ? { cancelReason: opts.note ?? null, cancelledBy: opts.cancelledBy ?? null } : {}),
        ...opts.extra,
        updatedAt: now,
      })
      .where(eq(orders.id, id));
    await tx.insert(orderEvents).values({ orderId: id, status: to, byUserId, note: opts.note ?? null });
    if (to === "cancelled") await restock(tx, id);
  });
  // An unpaid mobile money order the shop never saw: only the buyer needs to know.
  await tellAboutOrder(id, to, previous === "awaiting_payment" ? { ...opts, cancelledBy: "seller" } : opts);
}

/** Bell + push for the people an order step matters to. */
async function tellAboutOrder(id: string, to: OrderStatus, opts: { note?: string | null; cancelledBy?: "buyer" | "seller" | "admin" }) {
  const [o] = await db
    .select({ id: orders.id, number: orders.number, buyerId: orders.buyerId, riderId: orders.riderId, shopName: shops.name, ownerId: shops.ownerId, fulfilment: orders.fulfilment })
    .from(orders)
    .innerJoin(shops, eq(shops.id, orders.shopId))
    .where(eq(orders.id, id))
    .limit(1);
  if (!o) return;
  const no = orderNumber(o.number ?? 0);
  const buyer = { type: "order" as const, link: `/orders/${o.id}` };
  const seller = { type: "order" as const, link: "/sell/orders" };
  // Eat in / pickup: no rider — the buyer comes to the restaurant.
  if (o.fulfilment !== "delivery") {
    const eatIn = o.fulfilment === "eat_in";
    if (to === "placed") notify([o.ownerId], { ...seller, title: `New ${eatIn ? "eat-in" : "pickup"} order ${no}`, body: "Accept it and start cooking." });
    else if (to === "accepted") notify([o.buyerId], { ...buyer, title: `${o.shopName} accepted ${no}`, body: "They're preparing your food." });
    else if (to === "ready") notify([o.buyerId], { ...buyer, title: `${no} is ready`, body: eatIn ? "Your food is ready to be served." : "Come and collect it." });
    else if (to === "delivered") {
      notify([o.buyerId], { ...buyer, title: eatIn ? `Enjoy your meal — ${no}` : `${no} collected`, body: "How was it? Rate your food." });
      notify([o.ownerId], { ...seller, title: `${no} is done`, body: "It's in your earnings.", link: "/sell/earnings" });
    } else if (to === "cancelled") {
      const why = opts.note ? ` — ${opts.note}` : "";
      if (opts.cancelledBy !== "buyer") notify([o.buyerId], { ...buyer, title: `${no} was cancelled`, body: `${o.shopName}${why}` });
      if (opts.cancelledBy !== "seller") notify([o.ownerId], { ...seller, title: `${no} was cancelled`, body: opts.cancelledBy === "buyer" ? `The buyer cancelled${why}` : `Cancelled by YanaBuy${why}` });
    }
    return;
  }
  if (to === "placed") notify([o.ownerId], { ...seller, title: `New order ${no}`, body: "Accept it so the rider can come for it." });
  else if (to === "accepted") {
    notify([o.buyerId], { ...buyer, title: `${o.shopName} accepted ${no}`, body: "They're getting it ready." });
    notifyAdmins({ title: `${no} accepted`, body: `${o.shopName} is picking a rider (you can assign one too)`, path: "/orders" });
  }
  else if (to === "ready") notify([o.buyerId], { ...buyer, title: `${no} is packed`, body: "A rider will pick it up soon." });
  else if (to === "picked_up") notify([o.buyerId], { ...buyer, title: `${no} is on the way`, body: "Your rider has picked it up." });
  else if (to === "delivered") {
    notify([o.buyerId], { ...buyer, title: `${no} was delivered`, body: "How was it? Rate your items." });
    notify([o.ownerId], { ...seller, title: `${no} was delivered`, body: "Your earnings are in your balance.", link: "/sell/earnings" });
  } else if (to === "cancelled") {
    const why = opts.note ? ` — ${opts.note}` : "";
    if (opts.cancelledBy !== "buyer") notify([o.buyerId], { ...buyer, title: `${no} was cancelled`, body: `${o.shopName}${why}` });
    if (opts.cancelledBy !== "seller") notify([o.ownerId], { ...seller, title: `${no} was cancelled`, body: opts.cancelledBy === "buyer" ? `The buyer cancelled${why}` : `Cancelled by YanaBuy${why}` });
    if (o.riderId) notify([o.riderId], { type: "order", title: `${no} was cancelled`, body: "No need to deliver it.", link: "/rider" });
  }
}

/**
 * Changes one variant's stock (and the product's total) with the product row locked,
 * so two buyers can't take the last one. Throws if there isn't enough.
 */
export async function takeVariantStock(tx: Tx, productId: string, variantId: string, quantity: number) {
  const [p] = await tx.select().from(products).where(eq(products.id, productId)).for("update").limit(1);
  if (!p) throw new Error("gone");
  let found = false;
  const variants = p.variants.map((v) => {
    if (v.id !== variantId) return v;
    found = true;
    if (v.stock === null) return v;
    if (v.stock < quantity) throw new Error("not enough");
    return { ...v, stock: v.stock - quantity };
  });
  if (!found) {
    if (quantity < 0) return; // putting back stock for a choice that was removed since
    throw new Error("gone");
  }
  const counted = variants.every((v) => v.stock !== null);
  await tx
    .update(products)
    .set({ variants, stock: counted ? variants.reduce((n, v) => n + (v.stock ?? 0), 0) : null })
    .where(eq(products.id, productId));
}

async function restock(tx: Tx, orderId: string) {
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  for (const i of items) {
    if (!i.productId) continue;
    if (i.variantId) {
      await takeVariantStock(tx, i.productId, i.variantId, -i.quantity).catch(() => {});
      continue;
    }
    await tx
      .update(products)
      .set({ stock: sql`${products.stock} + ${i.quantity}` })
      .where(and(eq(products.id, i.productId), sql`${products.stock} is not null`));
  }
}

export async function addEvent(orderId: string, status: string, byUserId: string, note?: string | null) {
  await db.insert(orderEvents).values({ orderId, status, byUserId, note: note ?? null });
}

/**
 * The shop's view of an order: its own prices on the items, the items subtotal at those prices,
 * and what it earns. (Buyers only ever see the prices with YanaBuy's commission already in them.)
 */
export async function forSeller(order: Order): Promise<Order> {
  const [rows, [o]] = await Promise.all([
    db.select({ id: orderItems.id, sellerPrice: orderItems.sellerPrice }).from(orderItems).where(eq(orderItems.orderId, order.id)),
    db.select({ sellerEarning: orders.sellerEarning }).from(orders).where(eq(orders.id, order.id)).limit(1),
  ]);
  const own = new Map(rows.map((r) => [r.id, r.sellerPrice]));
  const onTop = rows.length > 0 && rows.every((r) => r.sellerPrice !== null);
  return {
    ...order,
    items: order.items.map((i) => ({ ...i, price: own.get(i.id) ?? i.price })),
    subtotal: onTop ? order.items.reduce((n, i) => n + (own.get(i.id) ?? i.price) * i.quantity, 0) : order.subtotal,
    sellerEarning: o?.sellerEarning ?? null,
  };
}

/** The admin's view: buyer prices as charged, plus what the shop earns (the rest of the items total is YanaBuy's commission). */
export async function withEarning(order: Order): Promise<Order> {
  const [o] = await db.select({ sellerEarning: orders.sellerEarning }).from(orders).where(eq(orders.id, order.id)).limit(1);
  return { ...order, sellerEarning: o?.sellerEarning ?? null };
}
