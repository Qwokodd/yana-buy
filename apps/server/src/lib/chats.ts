import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { orderNumber, type ChatMessage, type ConversationSummary } from "@yanabuy/shared";
import { db } from "../db/client";
import { notify } from "./notify";
import { conversations, messages, orders, products, shops, users, type ConversationRow, type MessageRow, type ShopRow } from "../db/schema";

const shopSummary = (s: ShopRow) => ({ id: s.id, name: s.name, slug: s.slug, kind: s.kind, city: s.city, logoUrl: s.logoUrl, country: s.country });

export const selectConversations = () =>
  db
    .select({ c: conversations, shop: shops, buyer: { id: users.id, fullName: users.fullName, avatarUrl: users.avatarUrl } })
    .from(conversations)
    .innerJoin(shops, eq(shops.id, conversations.shopId))
    .innerJoin(users, eq(users.id, conversations.buyerId));

export type ConversationJoin = { c: ConversationRow; shop: ShopRow; buyer: { id: string; fullName: string; avatarUrl: string | null } };

/** Which side of a thread a user is on (buyer, or owner of the shop), or null if neither. */
export const sideOf = (r: ConversationJoin, userId: string): "buyer" | "shop" | null =>
  r.c.buyerId === userId ? "buyer" : r.shop.ownerId === userId ? "shop" : null;

/** Unread counts for a set of threads, from one side's point of view. */
export async function unreadFor(rows: ConversationJoin[], userId: string) {
  const out = new Map<string, number>();
  if (!rows.length) return out;
  const buyerIds = rows.filter((r) => sideOf(r, userId) === "buyer").map((r) => r.c.id);
  const shopIds = rows.filter((r) => sideOf(r, userId) === "shop").map((r) => r.c.id);
  const parts: SQL[] = [];
  if (buyerIds.length)
    parts.push(
      and(
        inArray(messages.conversationId, buyerIds),
        ne(messages.sender, "buyer"),
        sql`${messages.createdAt} > coalesce(${conversations.buyerReadAt}, 'epoch')`
      )!
    );
  if (shopIds.length)
    parts.push(
      and(
        inArray(messages.conversationId, shopIds),
        ne(messages.sender, "shop"),
        sql`${messages.createdAt} > coalesce(${conversations.shopReadAt}, 'epoch')`
      )!
    );
  const counts = await db
    .select({ id: messages.conversationId, n: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(or(...parts))
    .groupBy(messages.conversationId);
  for (const c of counts) out.set(c.id, c.n);
  return out;
}

export function conversationOut(r: ConversationJoin, side: "buyer" | "shop", unread = 0): ConversationSummary {
  return {
    id: r.c.id,
    side,
    shop: shopSummary(r.shop),
    buyer: r.buyer,
    lastMessage: r.c.lastMessage,
    lastMessageAt: r.c.lastMessageAt.toISOString(),
    unread,
  };
}

/** Messages in a thread, oldest first; `after` fetches only newer ones. */
export async function loadMessages(r: ConversationJoin, viewer: { side: "buyer" | "shop" | "admin" }, after?: Date): Promise<ChatMessage[]> {
  // Postgres keeps microseconds, JavaScript only milliseconds — compare at millisecond precision.
  const where = and(eq(messages.conversationId, r.c.id), after ? sql`date_trunc('milliseconds', ${messages.createdAt}) > ${after.toISOString()}::timestamptz` : undefined);
  const rows = await db
    .select({
      m: messages,
      product: { id: products.id, name: products.name, images: products.images, price: products.price },
      order: { id: orders.id, number: orders.number },
    })
    .from(messages)
    .leftJoin(products, eq(products.id, messages.productId))
    .leftJoin(orders, eq(orders.id, messages.orderId))
    .where(where)
    .orderBy(after ? asc(messages.createdAt) : desc(messages.createdAt))
    .limit(after ? 200 : 150);
  if (!after) rows.reverse();
  return rows.map((x) => messageOut(x.m, r, viewer.side, x.product, x.order));
}

export function messageOut(
  m: MessageRow,
  r: ConversationJoin,
  side: "buyer" | "shop" | "admin",
  product?: { id: string | null; name: string | null; images: string[] | null; price: number | null } | null,
  order?: { id: string | null; number: number | null } | null
): ChatMessage {
  return {
    id: m.id,
    sender: m.sender,
    mine: m.sender === side,
    senderName: m.sender === "buyer" ? r.buyer.fullName : m.sender === "shop" ? r.shop.name : "YanaBuy",
    body: m.body,
    imageUrl: m.imageUrl,
    product: product?.id ? { id: product.id, name: product.name ?? "", image: product.images?.[0] ?? null, price: product.price ?? 0 } : null,
    order: order?.id ? { id: order.id, number: orderNumber(order.number ?? 0) } : null,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Saves a message and moves the thread to the top. */
export async function postMessage(
  r: ConversationJoin,
  sender: "buyer" | "shop" | "admin",
  senderId: string,
  input: { body: string | null; imageUrl: string | null; productId: string | null; orderId: string | null }
) {
  const [m] = await db
    .insert(messages)
    .values({ conversationId: r.c.id, sender, senderId, body: input.body, imageUrl: input.imageUrl, productId: input.productId, orderId: input.orderId })
    .returning();
  const preview = input.body ? input.body.slice(0, 140) : input.imageUrl ? "📷 Photo" : "";
  await db
    .update(conversations)
    .set({
      lastMessage: sender === "admin" ? `YanaBuy: ${preview}` : preview,
      lastMessageAt: m.createdAt,
      ...(sender === "buyer" ? { buyerReadAt: m.createdAt } : sender === "shop" ? { shopReadAt: m.createdAt } : {}),
    })
    .where(eq(conversations.id, r.c.id));
  const [product] = input.productId
    ? await db.select({ id: products.id, name: products.name, images: products.images, price: products.price }).from(products).where(eq(products.id, input.productId))
    : [null];
  const [order] = input.orderId ? await db.select({ id: orders.id, number: orders.number }).from(orders).where(eq(orders.id, input.orderId)) : [null];
  // Tell the other side (the shop when the buyer writes; the buyer when the shop or YanaBuy writes).
  const to = sender === "buyer" ? [r.shop.ownerId] : [r.buyer.id];
  notify(to, {
    type: "chat",
    title: sender === "buyer" ? `${r.buyer.fullName} sent ${r.shop.name} a message` : sender === "shop" ? `New message from ${r.shop.name}` : "New message from YanaBuy",
    body: preview,
    link: `/messages?c=${r.c.id}`,
  });
  return messageOut(m, r, sender, product, order);
}
