import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { PublicShop } from "@yanabuy/shared";
import { db } from "../db/client";
import { banners, categories, portfolioItems, products, reviews, shops, users, type ShopRow } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { average, liveProduct, liveShop, productCard, productColumns, productFull } from "../lib/products";
import { foodHowOf } from "../lib/finance";
import { getBranding } from "../lib/branding";
import { slotsFor } from "../lib/bookings";
import { bannerOut, categoryOut } from "../lib/serialize";
import { countryOf } from "../lib/country";
import { portfolioOut } from "../lib/portfolio";
import { EMPTY_WORK_PROFILE } from "@yanabuy/shared";
import { newestFirst, ratingSummary, reviewOut, selectReviews } from "../lib/reviews";

/** Open to everyone, no login: what the storefronts need to draw themselves. */
export const publicRouter = Router();

publicRouter.get("/branding", async (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.json({ branding: await getBranding() });
});

publicRouter.get("/categories", async (req, res) => {
  const { kind } = parse(z.object({ kind: z.enum(["goods", "food"]).optional() }), req.query);
  const rows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.visible, true), kind ? eq(categories.kind, kind) : undefined))
    .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name));
  res.json({ items: rows.map(categoryOut) });
});

const bannerQuery = z.object({
  platform: z.enum(["web", "app"]),
  mode: z.enum(["goods", "food"]).optional(),
  placement: z.enum(["hero", "strip", "promo"]).optional(),
});

/** Banners and ads that are switched on and inside their dates, in the admin's order. */
publicRouter.get("/banners", async (req, res) => {
  const { platform, mode, placement } = parse(bannerQuery, req.query);
  const now = new Date();
  const rows = await db
    .select()
    .from(banners)
    .where(
      and(
        eq(banners.active, true),
        inArray(banners.platform, ["all", platform]),
        mode ? inArray(banners.mode, ["all", mode]) : undefined,
        placement ? eq(banners.placement, placement) : undefined,
        or(isNull(banners.country), eq(banners.country, countryOf(req))),
        or(isNull(banners.startsAt), lte(banners.startsAt, now)),
        or(isNull(banners.endsAt), gt(banners.endsAt, now))
      )
    )
    .orderBy(asc(banners.placement), asc(banners.sortOrder), asc(banners.createdAt));
  res.json({ items: rows.map(bannerOut) });
});

const clickLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false });

/** Counts a tap on a banner or ad, so admins can see which ones work. */
publicRouter.post("/banners/:id/click", clickLimiter, async (req, res) => {
  const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
  await db
    .update(banners)
    .set({ clicks: sql`${banners.clicks} + 1` })
    .where(eq(banners.id, id));
  res.status(204).end();
});

// ─── Products and shops ────────────────────────────────────────────────────

const PAGE = 24;

const productQuery = z.object({
  q: z.string().trim().max(80).optional(),
  mode: z.enum(["goods", "food"]).optional(),
  category: z.string().trim().max(80).optional(),
  shop: z.string().trim().max(80).optional(),
  sort: z.enum(["best", "newest", "price_asc", "price_desc", "top_rated"]).default("best"),
  china: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /** Only items YanaBuy picked as featured. */
  featured: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /** Only flash sales still running (soonest to end first). */
  flash: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /** Only services people can book a time for. */
  bookable: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

/** Products shoppers can see, with search, category, shop and sort. */
publicRouter.get("/products", async (req, res) => {
  const { q, mode, category, shop, sort, page, china, bookable, featured, flash } = parse(productQuery, req.query);
  // One shop's own page lists all its products whatever country is picked (a shared link must still work).
  const filters: SQL[] = [liveProduct, ...(shop ? [] : [eq(shops.country, countryOf(req))])];
  if (china) filters.push(eq(products.shipsFromChina, true));
  if (bookable) filters.push(eq(products.bookable, true));
  if (featured) filters.push(eq(products.featured, true));
  if (flash) filters.push(gt(products.saleEndsAt, new Date()));
  if (mode) filters.push(eq(products.kind, mode));
  if (category) filters.push(eq(categories.slug, category));
  if (shop) filters.push(eq(shops.slug, shop));
  if (q) {
    // Every word must appear somewhere: name, description, shop or category.
    for (const word of q.split(/\s+/).filter(Boolean).slice(0, 6)) {
      const like = `%${word}%`;
      filters.push(or(ilike(products.name, like), ilike(products.description, like), ilike(shops.name, like), ilike(categories.name, like))!);
    }
  }
  const where = and(...filters);
  const order = flash
    ? [asc(products.saleEndsAt)]
    : sort === "price_asc"
      ? [asc(products.price), desc(products.createdAt)]
      : sort === "price_desc"
        ? [desc(products.price), desc(products.createdAt)]
        : sort === "newest"
          ? [desc(products.createdAt)]
          : sort === "top_rated"
            ? [sql`(${products.ratingTotal}::float / nullif(${products.ratingCount}, 0)) desc nulls last`, desc(products.ratingCount), desc(products.createdAt)]
          : [desc(products.featured), desc(products.createdAt)];

  const base = () =>
    db
      .select(productColumns)
      .from(products)
      .innerJoin(shops, eq(shops.id, products.shopId))
      .innerJoin(users, eq(users.id, shops.ownerId))
      .leftJoin(categories, eq(categories.id, products.categoryId));

  const [rows, [total]] = await Promise.all([
    base().where(where).orderBy(...order, asc(products.id)).limit(PAGE).offset((page - 1) * PAGE),
    db
      .select({ n: count() })
      .from(products)
      .innerJoin(shops, eq(shops.id, products.shopId))
      .innerJoin(users, eq(users.id, shops.ownerId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(where),
  ]);
  const how = foodHowOf(req);
  res.json({ items: rows.map((r) => productCard(r, how)), total: total.n, page, pageSize: PAGE });
});

publicRouter.get("/products/:id", async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) throw new HttpError(404, "This product isn't available");
  const select = () =>
    db
      .select(productColumns)
      .from(products)
      .innerJoin(shops, eq(shops.id, products.shopId))
      .innerJoin(users, eq(users.id, shops.ownerId))
      .leftJoin(categories, eq(categories.id, products.categoryId));
  const [row] = await select()
    .where(and(eq(products.id, req.params.id), liveProduct))
    .limit(1);
  if (!row) throw new HttpError(404, "This product isn't available any more");
  // More from the same shop.
  const more = await select()
    .where(and(eq(products.shopId, row.shop.id), ne(products.id, row.product.id), liveProduct))
    .orderBy(desc(products.featured), desc(products.createdAt))
    .limit(8);
  const how = foodHowOf(req);
  res.json({ product: productFull(row, how), more: more.map((r) => productCard(r, how)) });
});

function publicShop(s: ShopRow, productCount: number, category?: { id: string | null; name: string | null; slug: string | null } | null, portfolioCount = 0): PublicShop {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    kind: s.kind,
    city: s.city,
    logoUrl: s.logoUrl,
    country: s.country,
    description: s.description,
    coverUrl: s.coverUrl,
    phone: s.phone,
    address: s.address,
    category: category?.id ? { id: category.id, name: category.name!, slug: category.slug! } : null,
    hours: s.hours,
    eatIn: s.kind === "restaurant" && s.eatIn,
    pickup: s.kind === "restaurant" && s.pickup,
    booking: s.bookingSettings?.enabled
      ? { kind: s.kind === "restaurant" ? "table" : "service", maxPartySize: s.bookingSettings.maxPartySize, daysAhead: s.bookingSettings.daysAhead, note: s.bookingSettings.note }
      : null,
    workProfile: s.workProfile ? { ...EMPTY_WORK_PROFILE, ...s.workProfile } : null,
    portfolioCount,
    productCount,
    rating: average(s.ratingTotal, s.ratingCount),
    ratingCount: s.ratingCount,
    createdAt: s.createdAt.toISOString(),
  };
}

/** How many live products each shop has. */
const liveCount = sql<number>`(select count(*)::int from ${products} p where p.shop_id = ${shops.id} and p.status = 'approved' and p.hidden = false)`;

const portfolioCount = sql<number>`(select count(*)::int from ${portfolioItems} pi where pi.shop_id = ${shops.id})`;

const shopCategory = { id: categories.id, name: categories.name, slug: categories.slug };

/** The shop directory: search, filter by kind and category, page through. */
publicRouter.get("/shops", async (req, res) => {
  const { q, mode, category, sort, page, limit } = parse(
    z.object({
      q: z.string().trim().max(80).optional(),
      mode: z.enum(["goods", "food"]).optional(),
      category: z.string().trim().max(80).optional(),
      sort: z.enum(["popular", "top_rated", "newest", "name"]).default("popular"),
      page: z.coerce.number().int().min(1).max(500).default(1),
      limit: z.coerce.number().int().min(1).max(48).default(12),
    }),
    req.query
  );
  const filters: SQL[] = [liveShop, eq(shops.country, countryOf(req))];
  if (mode) filters.push(eq(shops.kind, mode === "food" ? "restaurant" : "store"));
  if (category) filters.push(eq(categories.slug, category));
  if (q) filters.push(or(ilike(shops.name, `%${q}%`), ilike(shops.description, `%${q}%`), ilike(shops.city, `%${q}%`), ilike(shops.address, `%${q}%`), ilike(categories.name, `%${q}%`))!);
  const order =
    sort === "top_rated"
      ? [desc(sql`case when ${shops.ratingCount} > 0 then ${shops.ratingTotal}::float / ${shops.ratingCount} else 0 end`), desc(shops.ratingCount)]
      : sort === "newest"
        ? [desc(shops.createdAt)]
        : sort === "name"
          ? [asc(shops.name)]
          : [desc(liveCount), asc(shops.name)];
  const where = and(...filters);
  const [rows, [{ n: total }]] = await Promise.all([
    db
      .select({ shop: shops, n: liveCount, category: shopCategory, pc: portfolioCount })
      .from(shops)
      .innerJoin(users, eq(users.id, shops.ownerId))
      .leftJoin(categories, eq(categories.id, shops.categoryId))
      .where(where)
      .orderBy(...order)
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ n: count() })
      .from(shops)
      .innerJoin(users, eq(users.id, shops.ownerId))
      .leftJoin(categories, eq(categories.id, shops.categoryId))
      .where(where),
  ]);
  res.json({ items: rows.map((r) => publicShop(r.shop, r.n, r.category, r.pc)), total, page, pageSize: limit });
});

/** Free times for one day. For services, pass the product so its length is used. */
publicRouter.get("/shops/:slug/availability", async (req, res) => {
  const { date, productId } = parse(
    z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"), productId: z.string().uuid().optional() }),
    req.query
  );
  const [row] = await db
    .select({ shop: shops })
    .from(shops)
    .innerJoin(users, eq(users.id, shops.ownerId))
    .where(and(eq(shops.slug, String(req.params.slug)), liveShop))
    .limit(1);
  if (!row) throw new HttpError(404, "This shop isn't open right now");
  let duration: number | null = null;
  if (productId) {
    const [p] = await db.select({ d: products.durationMinutes, shopId: products.shopId }).from(products).where(eq(products.id, productId)).limit(1);
    if (p?.shopId === row.shop.id) duration = p.d;
  }
  res.json({ slots: await slotsFor(row.shop, date, duration) });
});

/** Categories for the shop directory, with how many open shops are in each (empty ones left out). */
publicRouter.get("/shop-categories", async (req, res) => {
  const { mode } = parse(z.object({ mode: z.enum(["goods", "food"]).default("goods") }), req.query);
  const rows = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug, iconUrl: categories.iconUrl, shopCount: count(shops.id) })
    .from(categories)
    .innerJoin(shops, eq(shops.categoryId, categories.id))
    .innerJoin(users, eq(users.id, shops.ownerId))
    .where(and(eq(categories.kind, mode), eq(categories.visible, true), liveShop, eq(shops.country, countryOf(req))))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  res.json({ items: rows });
});

publicRouter.get("/shops/:slug", async (req, res) => {
  const [row] = await db
    .select({ shop: shops, n: liveCount, category: shopCategory, pc: portfolioCount })
    .from(shops)
    .innerJoin(users, eq(users.id, shops.ownerId))
    .leftJoin(categories, eq(categories.id, shops.categoryId))
    .where(and(eq(shops.slug, req.params.slug), liveShop))
    .limit(1);
  if (!row) throw new HttpError(404, "This shop isn't open right now");
  res.json({ shop: publicShop(row.shop, row.n, row.category, row.pc) });
});

/** A shop's portfolio (past work), in the order the shop chose. */
publicRouter.get("/shops/:slug/portfolio", async (req, res) => {
  const [row] = await db
    .select({ id: shops.id })
    .from(shops)
    .innerJoin(users, eq(users.id, shops.ownerId))
    .where(and(eq(shops.slug, String(req.params.slug)), liveShop))
    .limit(1);
  if (!row) throw new HttpError(404, "This shop isn't open right now");
  const items = await db.select().from(portfolioItems).where(eq(portfolioItems.shopId, row.id)).orderBy(asc(portfolioItems.sortOrder), desc(portfolioItems.createdAt));
  res.json({ items: items.map(portfolioOut) });
});

// ─── Reviews ────────────────────────────────────────────────────────────────

const reviewPage = z.object({ page: z.coerce.number().int().min(1).max(200).default(1) });
const REVIEWS_PAGE = 10;

publicRouter.get("/products/:id/reviews", async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) throw new HttpError(404, "Product not found");
  const { page } = parse(reviewPage, req.query);
  const where = and(eq(reviews.productId, req.params.id), eq(reviews.hidden, false))!;
  const [summary, rows] = await Promise.all([
    ratingSummary(eq(reviews.productId, req.params.id)),
    selectReviews().where(where).orderBy(newestFirst).limit(REVIEWS_PAGE).offset((page - 1) * REVIEWS_PAGE),
  ]);
  res.json({ summary, items: rows.map(reviewOut), total: summary.count });
});

publicRouter.get("/shops/:slug/reviews", async (req, res) => {
  const { page } = parse(reviewPage, req.query);
  const [shop] = await db.select({ id: shops.id }).from(shops).where(eq(shops.slug, String(req.params.slug))).limit(1);
  if (!shop) throw new HttpError(404, "Shop not found");
  const where = and(eq(reviews.shopId, shop.id), eq(reviews.hidden, false))!;
  const [summary, rows] = await Promise.all([
    ratingSummary(eq(reviews.shopId, shop.id)),
    selectReviews().where(where).orderBy(newestFirst).limit(REVIEWS_PAGE).offset((page - 1) * REVIEWS_PAGE),
  ]);
  res.json({ summary, items: rows.map(reviewOut), total: summary.count });
});
