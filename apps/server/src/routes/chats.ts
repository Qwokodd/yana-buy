import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "../db/client";
import { conversations, orders, products, shops } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { imageUrl } from "../lib/validation";
import { conversationOut, loadMessages, postMessage, selectConversations, sideOf, unreadFor, type ConversationJoin } from "../lib/chats";
import { requireAuth } from "../middleware/auth";

/** Messages between buyers and shops. Mounted at /api/chats. */
export const chatsRouter = Router();
chatsRouter.use(requireAuth);

const sendLimiter = rateLimit({
  windowMs: 60_000,
  limit: 40,
  keyGenerator: (req) => (req as { user?: { id: string } }).user?.id ?? "anon",
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You're sending messages too fast. Wait a minute and try again." },
});

const messageSchema = z
  .object({
    body: z.string().trim().max(2000, "Keep messages under 2000 characters").nullish().transform((v) => v || null),
    imageUrl: imageUrl.nullish().transform((v) => v ?? null),
    productId: z.string().uuid().nullish().transform((v) => v ?? null),
    orderId: z.string().uuid().nullish().transform((v) => v ?? null),
  });

const needsContent = (m: { body: string | null; imageUrl: string | null }) => {
  if (!m.body && !m.imageUrl) throw new HttpError(400, "Write a message", { body: "Write a message" });
};

/** Threads where the person is the buyer or owns the shop. */
function mineWhere(userId: string) {
  return or(eq(conversations.buyerId, userId), eq(shops.ownerId, userId));
}

async function loadThread(id: string, userId: string) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Chat not found");
  const [r] = (await selectConversations().where(eq(conversations.id, id)).limit(1)) as ConversationJoin[];
  const side = r ? sideOf(r, userId) : null;
  if (!r || !side) throw new HttpError(404, "Chat not found");
  return { r, side };
}

/** A product or order mentioned in a message must belong to this shop (and, for orders, this buyer). */
async function checkContext(r: ConversationJoin, input: { productId: string | null; orderId: string | null }) {
  if (input.productId) {
    const [p] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, input.productId), eq(products.shopId, r.shop.id))).limit(1);
    if (!p) input.productId = null;
  }
  if (input.orderId) {
    const [o] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.shopId, r.shop.id), eq(orders.buyerId, r.c.buyerId)))
      .limit(1);
    if (!o) input.orderId = null;
  }
}

chatsRouter.get("/", async (req, res) => {
  const me = req.user!.id;
  const rows = (await selectConversations().where(mineWhere(me)).orderBy(desc(conversations.lastMessageAt)).limit(100)) as ConversationJoin[];
  const unread = await unreadFor(rows, me);
  res.json({ items: rows.map((r) => conversationOut(r, sideOf(r, me)!, unread.get(r.c.id) ?? 0)) });
});

chatsRouter.get("/unread", async (req, res) => {
  const me = req.user!.id;
  const rows = (await selectConversations().where(mineWhere(me)).limit(500)) as ConversationJoin[];
  const unread = await unreadFor(rows, me);
  res.json({ count: [...unread.values()].reduce((a, b) => a + b, 0) });
});

/** Opens the chat with a shop (creating it the first time), optionally with a first message. */
chatsRouter.post("/", sendLimiter, async (req, res) => {
  const input = parse(messageSchema.extend({ shopId: z.string({ required_error: "Shop not found" }).uuid("Shop not found") }), req.body);
  const me = req.user!.id;
  const [shop] = await db.select().from(shops).where(eq(shops.id, input.shopId)).limit(1);
  if (!shop || shop.status !== "approved") throw new HttpError(404, "This shop isn't taking messages right now");
  if (shop.ownerId === me) throw new HttpError(400, "This is your own shop");
  await db.insert(conversations).values({ buyerId: me, shopId: shop.id }).onConflictDoNothing();
  const [r] = (await selectConversations()
    .where(and(eq(conversations.buyerId, me), eq(conversations.shopId, shop.id)))
    .limit(1)) as ConversationJoin[];
  if (input.body || input.imageUrl) {
    await checkContext(r, input);
    await postMessage(r, "buyer", me, input);
  }
  const [fresh] = (await selectConversations().where(eq(conversations.id, r.c.id))) as ConversationJoin[];
  res.status(201).json({ conversation: conversationOut(fresh, "buyer") });
});

chatsRouter.get("/:id", async (req, res) => {
  const { after } = parse(z.object({ after: z.string().datetime().optional() }), req.query);
  const { r, side } = await loadThread(String(req.params.id), req.user!.id);
  const list = await loadMessages(r, { side }, after ? new Date(after) : undefined);
  await db
    .update(conversations)
    .set(side === "buyer" ? { buyerReadAt: new Date() } : { shopReadAt: new Date() })
    .where(eq(conversations.id, r.c.id));
  res.json({ conversation: conversationOut(r, side), messages: list });
});

chatsRouter.post("/:id/messages", sendLimiter, async (req, res) => {
  const input = parse(messageSchema, req.body);
  needsContent(input);
  const { r, side } = await loadThread(String(req.params.id), req.user!.id);
  if (side === "buyer" && r.shop.status !== "approved") throw new HttpError(409, "This shop isn't taking messages right now");
  await checkContext(r, input);
  res.status(201).json({ message: await postMessage(r, side, req.user!.id, input) });
});
