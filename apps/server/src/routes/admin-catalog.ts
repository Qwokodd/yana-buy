import { Router } from "express";
import { z } from "zod";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { COUNTRY_CODES, HEX_COLOR } from "@yanabuy/shared";
import { db } from "../db/client";
import { banners, categories, products } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { getBranding, saveBranding } from "../lib/branding";
import { adminBannerOut, categoryOut } from "../lib/serialize";
import { slugify } from "../lib/slug";
import { imageUrl, optionalText, requiredText } from "../lib/validation";

/** Categories, banners & ads, and branding. Mounted under /api/admin. */
export const adminCatalogRouter = Router();

const uuidParam = (id: unknown, what: string) => {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, `${what} not found`);
  return id as string;
};

// ─── Categories ────────────────────────────────────────────────────────────

adminCatalogRouter.get("/categories", async (_req, res) => {
  const rows = await db.select().from(categories).orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name));
  res.json({ items: rows.map(categoryOut) });
});

const categoryInput = z
  .object({
    kind: z.enum(["goods", "food"], { errorMap: () => ({ message: "Choose Goods & Services or Food" }) }),
    name: requiredText(2, 40, "Category name"),
    iconUrl: imageUrl.nullish().transform((v) => v ?? null),
    visible: z.boolean().default(true),
  })
  .strict();

async function assertNameFree(kind: "goods" | "food", slug: string, name: string, exceptId?: string) {
  const [clash] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.kind, kind), eq(categories.slug, slug), exceptId ? ne(categories.id, exceptId) : undefined))
    .limit(1);
  if (clash) throw new HttpError(409, `There's already a category called “${name}”`, { name: "Already exists" });
}

adminCatalogRouter.post("/categories", async (req, res) => {
  const input = parse(categoryInput, req.body);
  const slug = slugify(input.name);
  await assertNameFree(input.kind, slug, input.name);
  const last = await db
    .select({ sortOrder: categories.sortOrder })
    .from(categories)
    .where(eq(categories.kind, input.kind))
    .orderBy(asc(categories.sortOrder));
  const sortOrder = last.length ? last[last.length - 1].sortOrder + 1 : 0;
  const [row] = await db.insert(categories).values({ ...input, slug, sortOrder }).returning();
  await audit(req.user!.id, "category.create", { type: "category", id: row.id }, { name: row.name, kind: row.kind });
  res.status(201).json({ category: categoryOut(row) });
});

const categoryPatch = categoryInput.omit({ kind: true }).partial().strict();

adminCatalogRouter.patch("/categories/:id", async (req, res) => {
  const id = uuidParam(req.params.id, "Category");
  const input = parse(categoryPatch, req.body);
  const [current] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!current) throw new HttpError(404, "Category not found");
  const slug = input.name ? slugify(input.name) : current.slug;
  if (input.name) await assertNameFree(current.kind, slug, input.name, id);
  const [row] = await db
    .update(categories)
    .set({ ...input, slug, updatedAt: new Date() })
    .where(eq(categories.id, id))
    .returning();
  const what = input.visible === false ? "category.hide" : input.visible === true && !current.visible ? "category.show" : "category.update";
  await audit(req.user!.id, what, { type: "category", id }, { name: row.name, ...(input.name && input.name !== current.name ? { from: current.name } : {}) });
  res.json({ category: categoryOut(row) });
});

adminCatalogRouter.delete("/categories/:id", async (req, res) => {
  const id = uuidParam(req.params.id, "Category");
  const [used] = await db.select({ n: count() }).from(products).where(eq(products.categoryId, id));
  if (used.n > 0) {
    throw new HttpError(409, `${used.n} ${used.n === 1 ? "product uses" : "products use"} this category. Hide it instead, so those products keep their place.`);
  }
  const [row] = await db.delete(categories).where(eq(categories.id, id)).returning();
  if (!row) throw new HttpError(404, "Category not found");
  await audit(req.user!.id, "category.delete", { type: "category", id }, { name: row.name, kind: row.kind });
  res.status(204).end();
});

const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

adminCatalogRouter.post("/categories/reorder", async (req, res) => {
  const { ids } = parse(reorderSchema, req.body);
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      await tx.update(categories).set({ sortOrder: i }).where(eq(categories.id, id));
    }
  });
  await audit(req.user!.id, "category.reorder", { type: "category", id: ids[0] }, { count: ids.length });
  const rows = await db.select().from(categories).orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name));
  res.json({ items: rows.map(categoryOut) });
});

// ─── Banners & ads ─────────────────────────────────────────────────────────

const when = z
  .string()
  .datetime({ offset: true, message: "Pick a valid date" })
  .nullish()
  .transform((v) => (v ? new Date(v) : null));

const link = z
  .string()
  .trim()
  .max(500, "That link is too long")
  .nullish()
  .transform((v) => v || null)
  .refine((v) => v === null || /^https?:\/\/\S+$/.test(v) || /^\/\S*$/.test(v), "Use a full link (https://…) or a page on YanaBuy (/search?q=…)");

const bannerFields = {
  kind: z.enum(["banner", "ad"]).default("banner"),
  title: requiredText(2, 80, "Title"),
  subtitle: optionalText(160, "Subtitle"),
  imageUrl: z.string({ required_error: "Upload a picture" }).pipe(imageUrl),
  /** A 5–10 second video (uploaded through /api/uploads/video). */
  videoUrl: z
    .string()
    .trim()
    .max(500)
    .regex(/^https?:\/\/\S+\.(mp4|webm|mov)$/i, "Upload the video again")
    .nullish()
    .transform((v) => v || null),
  linkUrl: link,
  buttonLabel: optionalText(24, "Button text"),
  advertiser: optionalText(60, "Advertiser"),
  placement: z.enum(["hero", "strip", "promo"]).default("hero"),
  platform: z.enum(["all", "web", "app"]).default("all"),
  mode: z.enum(["all", "goods", "food"]).default("all"),
  /** null = every country. */
  country: z.enum(COUNTRY_CODES).nullish(),
  startsAt: when,
  endsAt: when,
  active: z.boolean().default(true),
};

function checkBanner(v: { kind?: string; placement?: string; advertiser?: string | null; startsAt?: Date | null; endsAt?: Date | null }, ctx: z.RefinementCtx) {
  if (v.kind === "ad" && !v.advertiser) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["advertiser"], message: "Enter who the ad is for" });
  }
  if (v.placement === "promo" && !v.endsAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "A promo needs an end date — that's what the countdown counts down to" });
  }
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "The end date must be after the start date" });
  }
}

const bannerCreate = z.object(bannerFields).strict().superRefine(checkBanner);
const bannerPatch = z.object(bannerFields).partial().strict();

adminCatalogRouter.get("/banners", async (_req, res) => {
  const rows = await db.select().from(banners).orderBy(asc(banners.placement), asc(banners.sortOrder), asc(banners.createdAt));
  const now = new Date();
  res.json({ items: rows.map((b) => adminBannerOut(b, now)) });
});

adminCatalogRouter.post("/banners", async (req, res) => {
  const input = parse(bannerCreate, req.body);
  const existing = await db.select({ sortOrder: banners.sortOrder }).from(banners).where(eq(banners.placement, input.placement));
  const sortOrder = existing.reduce((m, b) => Math.max(m, b.sortOrder + 1), 0);
  const [row] = await db.insert(banners).values({ ...input, sortOrder }).returning();
  await audit(req.user!.id, row.kind === "ad" ? "ad.create" : "banner.create", { type: "banner", id: row.id }, { title: row.title });
  res.status(201).json({ banner: adminBannerOut(row) });
});

adminCatalogRouter.patch("/banners/:id", async (req, res) => {
  const id = uuidParam(req.params.id, "Banner");
  const input = parse(bannerPatch, req.body);
  const [current] = await db.select().from(banners).where(eq(banners.id, id)).limit(1);
  if (!current) throw new HttpError(404, "Banner not found");
  // Check the combined result (e.g. new end date against the saved start date).
  parse(z.object({}).passthrough().superRefine(checkBanner), { ...current, ...input });
  const [row] = await db
    .update(banners)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(banners.id, id))
    .returning();
  const action = input.active === false ? "banner.off" : input.active === true && !current.active ? "banner.on" : "banner.update";
  await audit(req.user!.id, action, { type: "banner", id }, { title: row.title });
  res.json({ banner: adminBannerOut(row) });
});

adminCatalogRouter.delete("/banners/:id", async (req, res) => {
  const id = uuidParam(req.params.id, "Banner");
  const [row] = await db.delete(banners).where(eq(banners.id, id)).returning();
  if (!row) throw new HttpError(404, "Banner not found");
  await audit(req.user!.id, "banner.delete", { type: "banner", id }, { title: row.title });
  res.status(204).end();
});

adminCatalogRouter.post("/banners/reorder", async (req, res) => {
  const { ids } = parse(reorderSchema, req.body);
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) await tx.update(banners).set({ sortOrder: i }).where(eq(banners.id, id));
  });
  const rows = await db.select().from(banners).orderBy(asc(banners.placement), asc(banners.sortOrder), asc(banners.createdAt));
  const now = new Date();
  res.json({ items: rows.map((b) => adminBannerOut(b, now)) });
});

// ─── Branding ──────────────────────────────────────────────────────────────

const hex = (label: string) => z.string().regex(HEX_COLOR, `${label} must be a colour like #491F67`).transform((v) => v.toUpperCase());

const brandingSchema = z
  .object({
    appName: requiredText(2, 30, "App name"),
    tagline: z.string().trim().max(80, "Tagline is too long").default(""),
    logoUrl: imageUrl.nullish().transform((v) => v ?? null),
    faviconUrl: imageUrl.nullish().transform((v) => v ?? null),
    colors: z.object({
      primary: hex("Main colour"),
      ink: hex("Dark colour"),
      goods: hex("Goods colour"),
      food: hex("Food colour"),
    }),
  })
  .strict();

adminCatalogRouter.get("/branding", async (_req, res) => {
  res.json({ branding: await getBranding() });
});

adminCatalogRouter.put("/branding", async (req, res) => {
  const input = parse(brandingSchema, req.body);
  const before = await getBranding();
  const branding = await saveBranding(input, req.user!.id);
  const changed = (Object.keys(input) as (keyof typeof input)[]).filter(
    (k) => JSON.stringify(input[k]) !== JSON.stringify(before[k])
  );
  await audit(req.user!.id, "branding.update", { type: "settings", id: "branding" }, { changed: changed.join(", ") || "nothing" });
  res.json({ branding });
});
