import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { orderItems, orders, reviews, shops } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { optionalText } from "../lib/validation";
import { newestFirst, ratingSummary, recountRatings, reviewOut, selectReviews } from "../lib/reviews";
import { requireAuth } from "../middleware/auth";

/** Buyers rate what they bought. Mounted at /api/reviews. */
export const reviewsRouter = Router();
reviewsRouter.use(requireAuth);

const reviewSchema = z.object({
  orderId: z.string().uuid("Order not found"),
  productId: z.string().uuid("Product not found"),
  rating: z
    .number({ required_error: "Choose 1 to 5 stars", invalid_type_error: "Choose 1 to 5 stars" })
    .int("Choose 1 to 5 stars")
    .min(1, "Choose 1 to 5 stars")
    .max(5, "Choose 1 to 5 stars"),
  comment: optionalText(1000, "Your review"),
});

/** Writes a review, or changes the buyer's own review of the same item. */
reviewsRouter.post("/", async (req, res) => {
  const input = parse(reviewSchema, req.body);
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.buyerId, req.user!.id)))
    .limit(1);
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status !== "delivered") throw new HttpError(409, "You can review items once your order is delivered");
  const [item] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, order.id), eq(orderItems.productId, input.productId)))
    .limit(1);
  if (!item) throw new HttpError(404, "That item isn't in this order, or it has been removed from the shop");

  const [row] = await db
    .insert(reviews)
    .values({ orderId: order.id, productId: input.productId, shopId: order.shopId, buyerId: req.user!.id, rating: input.rating, comment: input.comment })
    .onConflictDoUpdate({
      target: [reviews.orderId, reviews.productId],
      set: { rating: input.rating, comment: input.comment, updatedAt: new Date() },
    })
    .returning();
  await recountRatings(input.productId, order.shopId);
  const [full] = await selectReviews().where(eq(reviews.id, row.id));
  res.status(201).json({ review: reviewOut(full) });
});

/** The buyer's own reviews for one order (to fill in the stars they gave). */
reviewsRouter.get("/order/:orderId", async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.orderId).success) throw new HttpError(404, "Order not found");
  const rows = await selectReviews().where(and(eq(reviews.orderId, req.params.orderId), eq(reviews.buyerId, req.user!.id)));
  res.json({ items: rows.map((r) => ({ ...reviewOut(r), productId: r.product.id })) });
});

/** A seller's reviews and replies. Mounted at /api/shop/reviews. */
export const shopReviewsRouter = Router();
shopReviewsRouter.use(requireAuth);

async function myShopId(userId: string) {
  const [shop] = await db.select({ id: shops.id }).from(shops).where(eq(shops.ownerId, userId)).limit(1);
  if (!shop) throw new HttpError(404, "Open a shop first");
  return shop.id;
}

shopReviewsRouter.get("/", async (req, res) => {
  const shopId = await myShopId(req.user!.id);
  const [summary, rows] = await Promise.all([
    ratingSummary(eq(reviews.shopId, shopId)),
    selectReviews()
      .where(and(eq(reviews.shopId, shopId), eq(reviews.hidden, false)))
      .orderBy(newestFirst)
      .limit(200),
  ]);
  res.json({ summary, items: rows.map(reviewOut) });
});

shopReviewsRouter.post("/:id/reply", async (req, res) => {
  const { reply } = parse(
    z.object({ reply: z.string({ required_error: "Write a reply" }).trim().min(2, "Write a reply").max(600, "Keep the reply under 600 characters") }),
    req.body
  );
  const shopId = await myShopId(req.user!.id);
  if (!z.string().uuid().safeParse(req.params.id).success) throw new HttpError(404, "Review not found");
  const [updated] = await db
    .update(reviews)
    .set({ sellerReply: reply, sellerRepliedAt: new Date() })
    .where(and(eq(reviews.id, req.params.id), eq(reviews.shopId, shopId), eq(reviews.hidden, false)))
    .returning({ id: reviews.id });
  if (!updated) throw new HttpError(404, "Review not found");
  const [full] = await selectReviews().where(eq(reviews.id, updated.id));
  res.json({ review: reviewOut(full) });
});
