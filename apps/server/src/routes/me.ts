import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { and, count, desc, eq, isNull, lt, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import { categories, notifications, products, pushTokens, shopifyOrders, shops, users, wishlistItems } from "../db/schema";
import { productCard, productColumns } from "../lib/products";
import { markRead, notificationOut } from "../lib/notify";
import { shopifyOrderOut } from "../lib/shopify";
import { HttpError, parse } from "../lib/http";
import { publicUser } from "../lib/serialize";
import { fullName, imageUrl, optionalText, password } from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import { claimEmail, sendCode, verifyCode } from "../lib/email-codes";
import { email as emailField } from "../lib/validation";

export const meRouter = Router();

const owners = alias(users, "wish_owner");
/** Same rule as the shop: approved, not paused, approved shop, owner not blocked. */
const liveProductFor = (o: typeof owners) =>
  and(eq(products.status, "approved"), eq(products.hidden, false), eq(shops.status, "approved"), eq(o.status, "active"));
meRouter.use(requireAuth);

meRouter.get("/", (req, res) => {
  res.json({ user: publicUser(req.user!) });
});

/** Orders this person placed on the old Shopify store (read only). */
meRouter.get("/shopify-orders", async (req, res) => {
  const rows = await db.select().from(shopifyOrders).where(eq(shopifyOrders.userId, req.user!.id)).orderBy(desc(shopifyOrders.placedAt)).limit(200);
  // Buyers see what they bought, not admin-only notes.
  res.json({ items: rows.map((o) => ({ ...shopifyOrderOut(o), notes: null })) });
});

const updateSchema = z
  .object({
    fullName: fullName.optional(),
    city: optionalText(60, "City").optional(),
    avatarUrl: imageUrl.nullable().optional(),
  })
  .strict();

meRouter.patch("/", async (req, res) => {
  if (req.body && typeof req.body === "object" && "email" in req.body) {
    throw new HttpError(400, "Change your email with the code check (Account → Email)", { email: "Use the email form" });
  }
  const input = parse(updateSchema, req.body);
  const [user] = await db
    .update(users)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(users.id, req.user!.id))
    .returning();
  res.json({ user: publicUser(user) });
});

/**
 * Email: send a 6-digit code to the address (a new one, or the current one again),
 * then confirm it. The address only changes once the code is confirmed.
 */
meRouter.post("/email", async (req, res) => {
  const { email } = parse(z.object({ email: emailField.optional() }), req.body ?? {});
  const me = req.user!;
  const target = email ?? me.email;
  if (!target) throw new HttpError(400, "Enter your email address", { email: "Enter your email" });
  if (target === me.email && me.emailVerifiedAt) throw new HttpError(400, "That email is already confirmed", { email: "Already confirmed" });
  await claimEmail(target, me.id);
  // Not confirmed yet: keep the new address on the account so it shows while they wait for the code.
  if (!me.emailVerifiedAt && target !== me.email) {
    await db.update(users).set({ email: target, updatedAt: new Date() }).where(eq(users.id, me.id));
  }
  const out = await sendCode(me, target);
  res.json({ ...out, email: target });
});

meRouter.post("/email/verify", async (req, res) => {
  const { code } = parse(z.object({ code: z.string({ required_error: "Enter the code" }).trim().regex(/^\d{6}$/, "Enter the 6-digit code") }), req.body);
  const user = await verifyCode(req.user!.id, code);
  res.json({ user: publicUser(user) });
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: password,
});

meRouter.post("/password", async (req, res) => {
  const input = parse(passwordSchema, req.body);
  if (!(await bcrypt.compare(input.currentPassword, req.user!.passwordHash))) {
    throw new HttpError(400, "Your current password is wrong", { currentPassword: "Wrong password" });
  }
  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(input.newPassword, 12), updatedAt: new Date() })
    .where(eq(users.id, req.user!.id));
  res.status(204).send();
});

// ─── Wishlist ───────────────────────────────────────────────────────────────

/** Saved products, newest first. Ones no longer on sale are left out. */
meRouter.get("/wishlist", async (req, res) => {
  const rows = await db
    .select({ ...productColumns, saved: wishlistItems })
    .from(wishlistItems)
    .innerJoin(products, eq(products.id, wishlistItems.productId))
    .innerJoin(shops, eq(shops.id, products.shopId))
    .innerJoin(owners, eq(owners.id, shops.ownerId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(wishlistItems.userId, req.user!.id), liveProductFor(owners)))
    .orderBy(desc(wishlistItems.createdAt))
    .limit(200);
  res.json({ items: rows.map((r) => ({ product: productCard(r), priceAtSave: r.saved.priceAtSave, savedAt: r.saved.createdAt.toISOString() })) });
});

/** Just the ids, so hearts can show filled on product cards. */
meRouter.get("/wishlist/ids", async (req, res) => {
  const rows = await db.select({ id: wishlistItems.productId }).from(wishlistItems).where(eq(wishlistItems.userId, req.user!.id));
  res.json({ ids: rows.map((r) => r.id) });
});

meRouter.post("/wishlist/:productId", async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.productId).success) throw new HttpError(404, "Product not found");
  const [p] = await db.select({ id: products.id, price: products.price }).from(products).where(eq(products.id, req.params.productId)).limit(1);
  if (!p) throw new HttpError(404, "Product not found");
  const [{ n }] = await db.select({ n: count() }).from(wishlistItems).where(eq(wishlistItems.userId, req.user!.id));
  if (n >= 500) throw new HttpError(400, "Your wishlist is full — remove some items first");
  await db.insert(wishlistItems).values({ userId: req.user!.id, productId: p.id, priceAtSave: p.price }).onConflictDoNothing();
  res.status(201).json({ ok: true });
});

meRouter.delete("/wishlist/:productId", async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.productId).success) return res.status(204).end();
  await db.delete(wishlistItems).where(and(eq(wishlistItems.userId, req.user!.id), eq(wishlistItems.productId, req.params.productId)));
  res.status(204).end();
});

// ─── Notifications ──────────────────────────────────────────────────────────

meRouter.get("/notifications", async (req, res) => {
  const { before } = parse(z.object({ before: z.string().datetime().optional() }), req.query);
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, req.user!.id), before ? lt(notifications.createdAt, new Date(before)) : undefined))
    .orderBy(desc(notifications.createdAt))
    .limit(30);
  const [{ n }] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, req.user!.id), isNull(notifications.readAt)));
  res.json({ items: rows.map(notificationOut), unread: n });
});

meRouter.get("/notifications/unread", async (req, res) => {
  const [{ n }] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, req.user!.id), isNull(notifications.readAt)));
  res.json({ unread: n });
});

/** Mark some (ids) or all as read. */
meRouter.post("/notifications/read", async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string().uuid()).max(100).optional() }), req.body ?? {});
  await markRead(req.user!.id, ids);
  res.json({ ok: true });
});

/** The phone app registers its Expo push token after the person allows notifications. */
meRouter.post("/push-token", async (req, res) => {
  const { token, platform } = parse(
    z.object({ token: z.string().regex(/^(Exponent|Expo)PushToken\[[\w-]+\]$/, "Not a push token"), platform: z.enum(["ios", "android", "web"]).optional() }),
    req.body
  );
  await db
    .insert(pushTokens)
    .values({ userId: req.user!.id, token, platform: platform ?? null })
    .onConflictDoUpdate({ target: pushTokens.token, set: { userId: req.user!.id, platform: platform ?? null } });
  res.json({ ok: true });
});

/** Logging out on a phone stops its pushes. */
meRouter.delete("/push-token", async (req, res) => {
  const { token } = parse(z.object({ token: z.string().max(200) }), req.body ?? {});
  await db.delete(pushTokens).where(and(eq(pushTokens.token, token), eq(pushTokens.userId, req.user!.id)));
  res.status(204).end();
});
