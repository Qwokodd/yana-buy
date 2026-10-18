import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "../db/client";
import { categories, products, shops, wishlistItems } from "../db/schema";
import { notify, notifyAdmins } from "../lib/notify";
import { HttpError, parse } from "../lib/http";
import { myProduct, productColumns } from "../lib/products";
import { imageUrl, optionalText, requiredText } from "../lib/validation";
import { normalizeVariants, optionsSchema, summarize, variantsSchema } from "../lib/variants";
import { requireAuth } from "../middleware/auth";

/** A seller's own products. Mounted at /api/shop/products. */
export const shopProductsRouter = Router();
shopProductsRouter.use(requireAuth);

const MAX_PRICE = 1_000_000_000; // $10 million, in cents

const money = (label: string) =>
  z
    .number({ invalid_type_error: `Enter the ${label.toLowerCase()}`, required_error: `Enter the ${label.toLowerCase()}` })
    .int(`${label} must be in whole cents`)
    .min(1, `${label} must be more than zero`)
    .max(MAX_PRICE, `${label} is too high`);

const fields = {
  name: requiredText(2, 80, "Product name"),
  description: optionalText(2000, "Description"),
  categoryId: z.string({ required_error: "Choose a category" }).uuid("Choose a category"),
  price: money("Price").optional(),
  compareAtPrice: money("Old price").nullish().transform((v) => v ?? null),
  stock: z
    .number()
    .int("Stock must be a whole number")
    .min(0, "Stock can't be below zero")
    .max(100_000, "Stock is too high")
    .nullish()
    .transform((v) => (v === undefined ? undefined : v)),
  images: z
    .array(imageUrl, { required_error: "Add at least one photo" })
    .min(1, "Add at least one photo")
    .max(8, "You can add up to 8 photos"),
  shipsFromChina: z.boolean().optional(),
  deliveryDays: z
    .number()
    .int("Days must be a whole number")
    .min(1, "At least 1 day")
    .max(120, "At most 120 days")
    .nullish()
    .transform((v) => (v === undefined ? undefined : v)),
  bookable: z.boolean().optional(),
  durationMinutes: z.number().int().min(15, "At least 15 minutes").max(600, "At most 10 hours").nullish().transform((v) => (v === undefined ? undefined : v)),
  options: optionsSchema.optional(),
  variants: variantsSchema.optional(),
};

const createSchema = z
  .object(fields)
  .strict()
  .superRefine((v, ctx) => {
    if (v.options?.length) return; // price comes from the variants
    if (v.price === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["price"], message: "Enter the price" });
      return;
    }
    if (v.compareAtPrice !== null && v.compareAtPrice <= v.price) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["compareAtPrice"], message: "The old price must be higher than the price" });
    }
  });

const updateSchema = z
  .object({ ...fields, hidden: z.boolean() })
  .partial()
  .strict();

/** The seller's shop, which must be approved to manage products. */
async function myApprovedShop(userId: string) {
  const [shop] = await db.select().from(shops).where(eq(shops.ownerId, userId)).limit(1);
  if (!shop) throw new HttpError(404, "Open a shop first");
  if (shop.status === "suspended") {
    throw new HttpError(403, `Your shop is suspended${shop.statusReason ? `: ${shop.statusReason}` : ""}. Contact YanaBuy support.`);
  }
  if (shop.status !== "approved") throw new HttpError(403, "You can add products once your shop is approved");
  return shop;
}

async function checkCategory(categoryId: string, kind: "goods" | "food") {
  const [cat] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!cat || !cat.visible) throw new HttpError(400, "Choose a category", { categoryId: "Choose a category from the list" });
  if (cat.kind !== kind) {
    throw new HttpError(400, "That category is for the other side of the app", { categoryId: "Choose a category from the list" });
  }
}

async function loadOwn(shopId: string, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Product not found");
  const [row] = await db
    .select(productColumns)
    .from(products)
    .innerJoin(shops, eq(shops.id, products.shopId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.id, id), eq(products.shopId, shopId)))
    .limit(1);
  if (!row) throw new HttpError(404, "Product not found");
  return row;
}

shopProductsRouter.get("/", async (req, res) => {
  const [shop] = await db.select().from(shops).where(eq(shops.ownerId, req.user!.id)).limit(1);
  if (!shop) return res.json({ items: [] });
  const rows = await db
    .select(productColumns)
    .from(products)
    .innerJoin(shops, eq(shops.id, products.shopId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(products.shopId, shop.id))
    .orderBy(desc(products.createdAt));
  res.json({ items: rows.map(myProduct) });
});

shopProductsRouter.get("/:id", async (req, res) => {
  const shop = await myApprovedShop(req.user!.id);
  res.json({ product: myProduct(await loadOwn(shop.id, req.params.id)) });
});

shopProductsRouter.post("/", async (req, res) => {
  const shop = await myApprovedShop(req.user!.id);
  const input = parse(createSchema, req.body);
  const kind = shop.kind === "restaurant" ? "food" : "goods";
  await checkCategory(input.categoryId, kind);
  const { options: rawOptions, variants: rawVariants, ...rest } = input;
  const v = normalizeVariants(rawOptions ?? [], rawVariants ?? []);
  const money = v.variants.length ? summarize(v.variants) : { price: input.price!, compareAtPrice: input.compareAtPrice, stock: input.stock ?? null };
  const [created] = await db
    .insert(products)
    .values({
      ...rest,
      ...money,
      ...v,
      deliveryDays: input.deliveryDays ?? null,
      shipsFromChina: input.shipsFromChina ?? false,
      // Only shops (not restaurants) sell bookable services.
      bookable: kind === "goods" ? (input.bookable ?? false) : false,
      durationMinutes: kind === "goods" && input.bookable ? (input.durationMinutes ?? 60) : null,
      shopId: shop.id,
      kind,
    })
    .returning();
  notifyAdmins({ title: `New ${kind === "food" ? "dish" : "product"} to review: ${created.name}`, body: shop.name, path: "/products" });
  res.status(201).json({ product: myProduct(await loadOwn(shop.id, created.id)) });
});

/** Fields that change what shoppers see about the item — an admin looks again. Price, stock and pausing don't (nor do variant prices/stock). */
const REVIEWED = ["name", "description", "categoryId", "images", "options"] as const;

shopProductsRouter.patch("/:id", async (req, res) => {
  const shop = await myApprovedShop(req.user!.id);
  const input = parse(updateSchema, req.body);
  const { product } = await loadOwn(shop.id, req.params.id);
  if (product.status === "removed") {
    throw new HttpError(403, `An admin removed this product${product.statusReason ? `: ${product.statusReason}` : ""}. Contact YanaBuy support.`);
  }
  if (input.categoryId) await checkCategory(input.categoryId, product.kind);

  const { options: rawOptions, variants: rawVariants, ...rest } = input;
  let variantPart: { options: typeof product.options; variants: typeof product.variants } | undefined;
  let money: { price?: number; compareAtPrice?: number | null; stock?: number | null } = {};
  if (rawOptions !== undefined || rawVariants !== undefined) {
    const opts = rawOptions ?? product.options;
    variantPart = normalizeVariants(opts, rawVariants ?? (opts.length ? product.variants : []), product.variants);
    if (variantPart.variants.length) money = summarize(variantPart.variants);
  }
  const hasVariants = (variantPart?.variants ?? product.variants).length > 0;
  if (!hasVariants) {
    const price = input.price ?? product.price;
    const compare = input.compareAtPrice !== undefined ? input.compareAtPrice : product.compareAtPrice;
    if (compare !== null && compare <= price) {
      throw new HttpError(400, "The old price must be higher than the price", { compareAtPrice: "Must be higher than the price" });
    }
  }

  const next = { ...input, options: variantPart?.options };
  const changed = REVIEWED.some((k) => next[k] !== undefined && JSON.stringify(next[k]) !== JSON.stringify(product[k]));
  // A sent-back product goes back into the queue whenever it's edited.
  const needsReview = changed || product.status === "rejected";
  await db
    .update(products)
    .set({
      ...rest,
      ...(product.kind === "food" ? { bookable: false, durationMinutes: null } : rest.bookable && !rest.durationMinutes && !product.durationMinutes ? { durationMinutes: 60 } : {}),
      // With options, the price/stock fields come from the variants and can't be set directly.
      ...(hasVariants ? { price: undefined, compareAtPrice: undefined, stock: undefined } : {}),
      ...(variantPart ?? {}),
      ...money,
      ...(needsReview ? { status: "pending" as const, statusReason: null, submittedAt: new Date(), featured: false } : {}),
      updatedAt: new Date(),
    })
    .where(eq(products.id, product.id));
  const fresh = await loadOwn(shop.id, product.id);
  // Cheaper than before: tell the people who saved it (only while it's on sale).
  if (fresh.product.price < product.price && fresh.product.status === "approved" && !fresh.product.hidden) {
    const fans = await db
      .select({ userId: wishlistItems.userId })
      .from(wishlistItems)
      .where(and(eq(wishlistItems.productId, product.id), gt(wishlistItems.priceAtSave, fresh.product.price)));
    const usd = (c: number) => `$${(c / 100).toFixed(2).replace(/\.00$/, "")}`;
    notify(
      fans.map((f) => f.userId),
      { type: "price_drop", title: `Price drop: ${fresh.product.name}`, body: `Now ${usd(fresh.product.price)} (was ${usd(product.price)}) at ${shop.name}`, link: `/p/${product.id}` }
    );
  }
  if (needsReview && product.status !== "pending") notifyAdmins({ title: `Changed ${product.kind === "food" ? "dish" : "product"} to review: ${fresh.product.name}`, body: shop.name, path: "/products" });
  res.json({ product: myProduct(fresh), needsReview: needsReview && product.status !== "pending" });
});

shopProductsRouter.delete("/:id", async (req, res) => {
  const [shop] = await db.select().from(shops).where(eq(shops.ownerId, req.user!.id)).limit(1);
  if (!shop) throw new HttpError(404, "Product not found");
  // Orders (phase 4) will keep their own copy of the name and price.
  const { product } = await loadOwn(shop.id, req.params.id);
  await db.delete(products).where(eq(products.id, product.id));
  res.status(204).end();
});
