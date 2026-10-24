import { and, eq, isNotNull, lte, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { summarize } from "./variants";
import { alias } from "drizzle-orm/pg-core";
import type { AdminProduct, Fulfilment, MyProduct, Product, ProductCard, ShopSummary } from "@yanabuy/shared";
import { categories, products, shops, users, type CategoryRow, type ProductRow, type ShopRow } from "../db/schema";
import { buyerPrice, buyerPriceOrNull } from "./finance";

/** Shoppers only ever see products that are approved, not paused, from an approved shop whose owner isn't blocked. */
export const liveProduct: SQL = and(
  eq(products.status, "approved"),
  eq(products.hidden, false),
  eq(shops.status, "approved"),
  eq(users.status, "active")
)!;

/** Same rule for shops. */
export const liveShop: SQL = and(eq(shops.status, "approved"), eq(users.status, "active"))!;

export const reviewer = alias(users, "product_reviewer");

export const productColumns = {
  product: products,
  shop: shops,
  category: { id: categories.id, name: categories.name, slug: categories.slug },
};

export type ProductJoin = { product: ProductRow; shop: ShopRow; category: Pick<CategoryRow, "id" | "name" | "slug"> | null };

/**
 * Prices right now. A flash sale whose end time has passed shows the old price again
 * (the background job below also writes that back to the database).
 */
export function livePrices(p: ProductRow, now = new Date()) {
  if (!p.saleEndsAt || p.saleEndsAt > now) return { price: p.price, compareAtPrice: p.compareAtPrice, variants: p.variants, saleEndsAt: p.saleEndsAt };
  const variants = p.variants.map((v) => ({ ...v, price: v.compareAtPrice ?? v.price, compareAtPrice: null }));
  return {
    price: variants.length ? summarize(variants).price : (p.compareAtPrice ?? p.price),
    compareAtPrice: null,
    variants,
    saleEndsAt: null,
  };
}

/** Ends flash sales whose time is up: the old price becomes the price again. */
export async function endFlashSales() {
  const due = await db.select().from(products).where(and(isNotNull(products.saleEndsAt), lte(products.saleEndsAt, new Date())));
  for (const p of due) {
    const live = livePrices(p);
    await db
      .update(products)
      .set({ price: live.price, compareAtPrice: null, variants: live.variants, saleEndsAt: null, updatedAt: new Date() })
      .where(eq(products.id, p.id));
  }
  return due.length;
}

/** Average stars to one decimal, or null with no reviews. */
export const average = (total: number, count: number) => (count ? Math.round((total / count) * 10) / 10 : null);

function shopSummary(s: ShopRow): ShopSummary {
  return { id: s.id, name: s.name, slug: s.slug, kind: s.kind, city: s.city, logoUrl: s.logoUrl, country: s.country };
}

export function productCard({ product: row, shop, category }: ProductJoin, how: Fulfilment = "delivery"): ProductCard {
  const p = { ...row, ...livePrices(row) };
  return {
    id: p.id,
    kind: p.kind,
    name: p.name,
    // Buyers see one price: the seller's price with YanaBuy's commission already in it.
    // Food: depends on delivery / pickup / eat in (eat in = the restaurant's own price).
    price: buyerPrice(p.price, p.kind, how),
    compareAtPrice: buyerPriceOrNull(p.compareAtPrice, p.kind, how),
    image: p.images[0] ?? null,
    inStock: p.stock === null || p.stock > 0,
    featured: p.featured,
    shop: shopSummary(shop),
    category: category?.id ? category : null,
    rating: average(p.ratingTotal, p.ratingCount),
    ratingCount: p.ratingCount,
    shipsFromChina: p.shipsFromChina,
    deliveryDays: p.deliveryDays,
    hasOptions: p.variants.length > 0,
    saleEndsAt: p.saleEndsAt?.toISOString() ?? null,
  };
}

export function productFull(row: ProductJoin, how: Fulfilment = "delivery"): Product {
  const p = { ...row.product, ...livePrices(row.product) };
  return {
    ...productCard(row, how),
    description: p.description,
    images: p.images,
    stock: p.stock,
    options: p.options,
    variants: p.variants.map((v) => ({ ...v, price: buyerPrice(v.price, p.kind, how), compareAtPrice: buyerPriceOrNull(v.compareAtPrice, p.kind, how) })),
    weightGrams: p.weightGrams,
    bookable: p.bookable,
    durationMinutes: p.durationMinutes,
    createdAt: p.createdAt.toISOString(),
    shop: { ...shopSummary(row.shop), phone: row.shop.phone },
  };
}

export function myProduct(row: ProductJoin): MyProduct {
  const p = { ...row.product, ...livePrices(row.product) };
  const full = productFull(row);
  return {
    ...full,
    // The seller (and admin) work with the seller's own prices; buyerPrice is what shoppers see.
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    variants: p.variants,
    buyerPrice: full.price,
    status: p.status,
    statusReason: p.statusReason,
    hidden: p.hidden,
    submittedAt: p.submittedAt.toISOString(),
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
  };
}

export function adminProduct(
  row: ProductJoin & { ownerName: string; reviewer?: { id: string | null; fullName: string | null } | null }
): AdminProduct {
  const base = myProduct(row);
  return {
    ...base,
    shop: { ...base.shop, status: row.shop.status, ownerName: row.ownerName },
    reviewedBy: row.reviewer?.id ? { id: row.reviewer.id, fullName: row.reviewer.fullName ?? "" } : null,
  };
}
