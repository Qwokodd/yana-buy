import { and, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AdminProduct, MyProduct, Product, ProductCard, ShopSummary } from "@yanabuy/shared";
import { categories, products, shops, users, type CategoryRow, type ProductRow, type ShopRow } from "../db/schema";

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

/** Average stars to one decimal, or null with no reviews. */
export const average = (total: number, count: number) => (count ? Math.round((total / count) * 10) / 10 : null);

function shopSummary(s: ShopRow): ShopSummary {
  return { id: s.id, name: s.name, slug: s.slug, kind: s.kind, city: s.city, logoUrl: s.logoUrl, country: s.country };
}

export function productCard({ product: p, shop, category }: ProductJoin): ProductCard {
  return {
    id: p.id,
    kind: p.kind,
    name: p.name,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
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
  };
}

export function productFull(row: ProductJoin): Product {
  const p = row.product;
  return {
    ...productCard(row),
    description: p.description,
    images: p.images,
    stock: p.stock,
    options: p.options,
    variants: p.variants,
    bookable: p.bookable,
    durationMinutes: p.durationMinutes,
    createdAt: p.createdAt.toISOString(),
    shop: { ...shopSummary(row.shop), phone: row.shop.phone },
  };
}

export function myProduct(row: ProductJoin): MyProduct {
  const p = row.product;
  return {
    ...productFull(row),
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
