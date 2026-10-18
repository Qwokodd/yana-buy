import { Router } from "express";
import { z } from "zod";
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { DISPUTE_OUTCOME_LABEL, formatLD, orderNumber, type AdminConversation, type AdminDispute, type AdminReview } from "@yanabuy/shared";
import { db } from "../db/client";
import { conversations, disputes, messages, orders, products, reviews, shops, users, walletEntries, type DisputeRow } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { addEvent, loadOrder, summaries } from "../lib/orders";
import { disputeOut } from "../lib/disputes";
import { recountRatings, reviewOut, reviewSelection } from "../lib/reviews";
import { notify } from "../lib/notify";
import { loadMessages, postMessage, selectConversations, type ConversationJoin } from "../lib/chats";

/** Reviews, chats and disputes. Mounted under /api/admin. */
export const adminTrustRouter = Router();

const uuidParam = (id: unknown, what: string) => {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, `${what} not found`);
  return String(id);
};

// ─── Reviews ────────────────────────────────────────────────────────────────

const PAGE = 30;

async function adminReviews(where: SQL | undefined, page = 1) {
  const rows = await db
    .select({ ...reviewSelection, shop: shops, orderNo: orders.number })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.buyerId))
    .innerJoin(products, eq(products.id, reviews.productId))
    .innerJoin(shops, eq(shops.id, reviews.shopId))
    .innerJoin(orders, eq(orders.id, reviews.orderId))
    .where(where)
    .orderBy(desc(reviews.createdAt))
    .limit(PAGE)
    .offset((page - 1) * PAGE);
  return rows.map(
    (r): AdminReview => ({
      ...reviewOut(r),
      hidden: r.review.hidden,
      hiddenReason: r.review.hiddenReason,
      shop: { id: r.shop.id, name: r.shop.name, slug: r.shop.slug, kind: r.shop.kind, city: r.shop.city, logoUrl: r.shop.logoUrl, country: r.shop.country },
      orderNumber: orderNumber(r.orderNo ?? 0),
      buyer: { id: r.buyer.id, fullName: r.buyer.fullName },
    })
  );
}

adminTrustRouter.get("/reviews", async (req, res) => {
  const { q, hidden, page } = parse(
    z.object({
      q: z.string().trim().max(80).optional(),
      hidden: z.enum(["true", "false"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
    }),
    req.query
  );
  const filters: SQL[] = [];
  if (hidden) filters.push(eq(reviews.hidden, hidden === "true"));
  if (q) {
    const like = `%${q}%`;
    filters.push(or(ilike(products.name, like), ilike(shops.name, like), ilike(reviews.comment, like), ilike(users.fullName, like))!);
  }
  const where = filters.length ? and(...filters) : undefined;
  const [items, [total]] = await Promise.all([
    adminReviews(where, page),
    db
      .select({ n: count() })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.buyerId))
      .innerJoin(products, eq(products.id, reviews.productId))
      .innerJoin(shops, eq(shops.id, reviews.shopId))
      .where(where),
  ]);
  res.json({ items, total: total.n, page, pageSize: PAGE });
});

async function setHidden(id: string, hidden: boolean, reason: string | null, adminId: string) {
  const [r] = await db
    .update(reviews)
    .set({ hidden, hiddenReason: hidden ? reason : null, updatedAt: new Date() })
    .where(eq(reviews.id, id))
    .returning();
  if (!r) throw new HttpError(404, "Review not found");
  await recountRatings(r.productId, r.shopId);
  await audit(adminId, hidden ? "review.hide" : "review.unhide", { type: "review", id }, hidden ? { reason, rating: r.rating } : { rating: r.rating });
  const [out] = await adminReviews(eq(reviews.id, id));
  return out;
}

adminTrustRouter.post("/reviews/:id/hide", async (req, res) => {
  const id = uuidParam(req.params.id, "Review");
  const { reason } = parse(z.object({ reason: z.string({ required_error: "Give a reason" }).trim().min(3, "Give a reason").max(300) }), req.body);
  res.json({ review: await setHidden(id, true, reason, req.user!.id) });
});

adminTrustRouter.post("/reviews/:id/unhide", async (req, res) => {
  const id = uuidParam(req.params.id, "Review");
  res.json({ review: await setHidden(id, false, null, req.user!.id) });
});

// ─── Chats ──────────────────────────────────────────────────────────────────

function adminConversation(r: ConversationJoin, messageCount: number): AdminConversation {
  return {
    id: r.c.id,
    shop: { id: r.shop.id, name: r.shop.name, slug: r.shop.slug, kind: r.shop.kind, city: r.shop.city, logoUrl: r.shop.logoUrl, country: r.shop.country },
    buyer: r.buyer,
    lastMessage: r.c.lastMessage,
    lastMessageAt: r.c.lastMessageAt.toISOString(),
    messageCount,
  };
}

adminTrustRouter.get("/chats", async (req, res) => {
  const { q, page } = parse(z.object({ q: z.string().trim().max(80).optional(), page: z.coerce.number().int().min(1).default(1) }), req.query);
  const where = q ? or(ilike(shops.name, `%${q}%`), ilike(users.fullName, `%${q}%`)) : undefined;
  const rows = (await selectConversations()
    .where(where)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(PAGE)
    .offset((page - 1) * PAGE)) as ConversationJoin[];
  const [total] = await db
    .select({ n: count() })
    .from(conversations)
    .innerJoin(shops, eq(shops.id, conversations.shopId))
    .innerJoin(users, eq(users.id, conversations.buyerId))
    .where(where);
  const counts = rows.length
    ? await db
        .select({ id: messages.conversationId, n: sql<number>`count(*)::int` })
        .from(messages)
        .where(inArray(messages.conversationId, rows.map((r) => r.c.id)))
        .groupBy(messages.conversationId)
    : [];
  res.json({ items: rows.map((r) => adminConversation(r, counts.find((c) => c.id === r.c.id)?.n ?? 0)), total: total.n, page, pageSize: PAGE });
});

async function thread(id: string) {
  const [r] = (await selectConversations().where(eq(conversations.id, uuidParam(id, "Chat"))).limit(1)) as ConversationJoin[];
  if (!r) throw new HttpError(404, "Chat not found");
  return r;
}

/** Reading a private chat is logged in the audit log. */
adminTrustRouter.get("/chats/:id", async (req, res) => {
  const r = await thread(String(req.params.id));
  const list = await loadMessages(r, { side: "admin" });
  await audit(req.user!.id, "chat.view", { type: "conversation", id: r.c.id }, { shop: r.shop.name, buyer: r.buyer.fullName });
  res.json({ conversation: adminConversation(r, list.length), messages: list });
});

/** YanaBuy writes into a chat (both sides see it). */
adminTrustRouter.post("/chats/:id/messages", async (req, res) => {
  const { body } = parse(z.object({ body: z.string({ required_error: "Write a message" }).trim().min(1, "Write a message").max(2000) }), req.body);
  const r = await thread(String(req.params.id));
  const message = await postMessage(r, "admin", req.user!.id, { body, imageUrl: null, productId: null, orderId: null });
  await audit(req.user!.id, "chat.note", { type: "conversation", id: r.c.id }, { shop: r.shop.name, buyer: r.buyer.fullName });
  res.status(201).json({ message });
});

// ─── Disputes ───────────────────────────────────────────────────────────────

async function adminDisputes(rows: DisputeRow[]): Promise<AdminDispute[]> {
  if (!rows.length) return [];
  const orderIds = rows.map((d) => d.orderId);
  const [sums, buyers] = await Promise.all([
    summaries(inArray(orders.id, orderIds), { limit: rows.length }),
    db
      .select({ id: users.id, fullName: users.fullName, phone: users.phone, avatarUrl: users.avatarUrl })
      .from(users)
      .where(inArray(users.id, rows.map((d) => d.buyerId))),
  ]);
  return rows.map((d) => ({
    ...disputeOut(d),
    order: sums.find((s) => s.id === d.orderId)!,
    buyer: buyers.find((b) => b.id === d.buyerId)!,
  }));
}

adminTrustRouter.get("/disputes", async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(["open", "resolved", "all"]).default("open") }), req.query);
  const rows = await db
    .select()
    .from(disputes)
    .where(status === "all" ? undefined : eq(disputes.status, status))
    .orderBy(status === "open" ? disputes.createdAt : desc(disputes.createdAt))
    .limit(200);
  res.json({ items: await adminDisputes(rows) });
});

async function loadDispute(id: string) {
  const [d] = await db.select().from(disputes).where(eq(disputes.id, uuidParam(id, "Dispute"))).limit(1);
  if (!d) throw new HttpError(404, "Dispute not found");
  return d;
}

adminTrustRouter.get("/disputes/:id", async (req, res) => {
  const d = await loadDispute(String(req.params.id));
  const [[dispute], { order }] = await Promise.all([adminDisputes([d]), loadOrder(d.orderId)]);
  res.json({ dispute, order });
});

const decisionSchema = z
  .object({
    outcome: z.enum(["refund_full", "refund_partial", "no_refund"], { errorMap: () => ({ message: "Choose a decision" }) }),
    refundAmount: z.number().int().min(0, "Can't be negative"),
    sellerCharge: z.number().int().min(0, "Can't be negative"),
    refundReference: z
      .string()
      .trim()
      .max(80)
      .nullish()
      .transform((v) => v || null),
    note: z.string({ required_error: "Explain the decision" }).trim().min(5, "Explain the decision in a few words").max(1000),
  })
  .superRefine((v, ctx) => {
    if (v.outcome === "no_refund" && (v.refundAmount || v.sellerCharge)) {
      ctx.addIssue({ code: "custom", path: ["refundAmount"], message: "No refund means both amounts are zero" });
    }
    if (v.outcome !== "no_refund" && v.refundAmount <= 0) ctx.addIssue({ code: "custom", path: ["refundAmount"], message: "Enter the refund amount" });
    if (v.refundAmount > 0 && (!v.refundReference || v.refundReference.length < 3)) {
      ctx.addIssue({ code: "custom", path: ["refundReference"], message: "Send the refund first, then enter its transaction ID" });
    }
    if (v.sellerCharge > v.refundAmount) ctx.addIssue({ code: "custom", path: ["sellerCharge"], message: "Can't charge the seller more than the refund" });
  });

adminTrustRouter.post("/disputes/:id/resolve", async (req, res) => {
  const input = parse(decisionSchema, req.body);
  const d = await loadDispute(String(req.params.id));
  if (d.status !== "open") throw new HttpError(409, "This dispute is already decided");
  const [o] = await db.select().from(orders).where(eq(orders.id, d.orderId));
  if (input.refundAmount > o.total) {
    throw new HttpError(400, `The refund can't be more than the order total (${formatLD(o.total)})`, { refundAmount: `At most ${formatLD(o.total)}` });
  }
  if (input.outcome === "refund_full" && input.refundAmount !== o.total) {
    throw new HttpError(400, `A full refund is the order total, ${formatLD(o.total)}`, { refundAmount: `Must be ${formatLD(o.total)}` });
  }
  if (input.sellerCharge > o.subtotal) {
    throw new HttpError(400, `The seller can be charged at most the item total (${formatLD(o.subtotal)})`, { sellerCharge: `At most ${formatLD(o.subtotal)}` });
  }
  const number = `DP-${d.number}`;
  await db.transaction(async (tx) => {
    const [done] = await tx
      .update(disputes)
      .set({
        status: "resolved",
        outcome: input.outcome,
        refundAmount: input.refundAmount,
        sellerCharge: input.sellerCharge,
        refundReference: input.refundReference,
        decisionNote: input.note,
        resolvedById: req.user!.id,
        resolvedAt: new Date(),
      })
      .where(and(eq(disputes.id, d.id), eq(disputes.status, "open")))
      .returning({ id: disputes.id });
    if (!done) throw new HttpError(409, "This dispute is already decided");
    if (input.sellerCharge > 0) {
      await tx.insert(walletEntries).values({
        shopId: d.shopId,
        type: "refund",
        amount: -input.sellerCharge,
        orderId: d.orderId,
        note: `Refund for ${number}`,
        byUserId: req.user!.id,
      });
    }
    if (input.outcome === "refund_full") await tx.update(orders).set({ paymentStatus: "refunded", updatedAt: new Date() }).where(eq(orders.id, d.orderId));
  });
  await addEvent(
    d.orderId,
    "dispute_resolved",
    req.user!.id,
    input.refundAmount ? `${DISPUTE_OUTCOME_LABEL[input.outcome]}: ${formatLD(input.refundAmount)}` : DISPUTE_OUTCOME_LABEL[input.outcome]
  );
  await audit(req.user!.id, "dispute.resolve", { type: "dispute", id: d.id }, { number, outcome: input.outcome, refund: input.refundAmount, sellerCharge: input.sellerCharge });
  {
    const [owner] = await db.select({ id: shops.ownerId }).from(shops).where(eq(shops.id, d.shopId)).limit(1);
    const title = `YanaBuy decided the problem with ${number}`;
    notify([d.buyerId], { type: "dispute", title, link: `/orders/${d.orderId}` });
    notify([owner?.id], { type: "dispute", title, link: "/sell/orders" });
  }
  const [dispute] = await adminDisputes([await loadDispute(d.id)]);
  res.json({ dispute });
});
