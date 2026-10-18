import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { shortName, type RatingSummary, type Review } from "@yanabuy/shared";
import { db } from "../db/client";
import { products, reviews, shops, users, type ReviewRow } from "../db/schema";
import { average } from "./products";

export const reviewSelection = {
  review: reviews,
  buyer: { id: users.id, fullName: users.fullName, avatarUrl: users.avatarUrl },
  product: { id: products.id, name: products.name, images: products.images },
};

export type ReviewJoin = {
  review: ReviewRow;
  buyer: { id: string; fullName: string; avatarUrl: string | null };
  product: { id: string; name: string; images: string[] };
};

export const selectReviews = () =>
  db
    .select(reviewSelection)
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.buyerId))
    .innerJoin(products, eq(products.id, reviews.productId));

export function reviewOut(r: ReviewJoin): Review {
  return {
    id: r.review.id,
    rating: r.review.rating,
    comment: r.review.comment,
    buyerName: shortName(r.buyer.fullName),
    buyerAvatar: r.buyer.avatarUrl,
    product: { id: r.product.id, name: r.product.name, image: r.product.images[0] ?? null },
    sellerReply: r.review.sellerReply,
    sellerRepliedAt: r.review.sellerRepliedAt?.toISOString() ?? null,
    createdAt: r.review.createdAt.toISOString(),
  };
}

/** Star breakdown for visible reviews matching `where`. */
export async function ratingSummary(where: SQL): Promise<RatingSummary> {
  const rows = await db
    .select({ rating: reviews.rating, n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(and(where, eq(reviews.hidden, false)))
    .groupBy(reviews.rating);
  const stars = [1, 2, 3, 4, 5].map((s) => rows.find((r) => r.rating === s)?.n ?? 0);
  const count = stars.reduce((a, b) => a + b, 0);
  const total = stars.reduce((a, n, i) => a + n * (i + 1), 0);
  return { average: average(total, count), count, stars };
}

/** Recounts the stars on a product and its shop after a review changes. */
export async function recountRatings(productId: string, shopId: string) {
  await db
    .update(products)
    .set({
      ratingCount: sql`(select count(*)::int from ${reviews} where ${reviews.productId} = ${productId} and ${reviews.hidden} = false)`,
      ratingTotal: sql`(select coalesce(sum(${reviews.rating}), 0)::int from ${reviews} where ${reviews.productId} = ${productId} and ${reviews.hidden} = false)`,
    })
    .where(eq(products.id, productId));
  await db
    .update(shops)
    .set({
      ratingCount: sql`(select count(*)::int from ${reviews} where ${reviews.shopId} = ${shopId} and ${reviews.hidden} = false)`,
      ratingTotal: sql`(select coalesce(sum(${reviews.rating}), 0)::int from ${reviews} where ${reviews.shopId} = ${shopId} and ${reviews.hidden} = false)`,
    })
    .where(eq(shops.id, shopId));
}

export const newestFirst = desc(reviews.createdAt);
