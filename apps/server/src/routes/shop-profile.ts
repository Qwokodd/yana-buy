import { Router } from "express";
import { z } from "zod";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { EMPTY_WORK_PROFILE, isVideoLink, type WorkProfile } from "@yanabuy/shared";
import { db } from "../db/client";
import { portfolioItems, shops } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { portfolioOut } from "../lib/portfolio";
import { imageUrl, optionalText, requiredText } from "../lib/validation";
import { requireAuth } from "../middleware/auth";

/** A shop's work profile and portfolio (past work). Mounted at /api/shop. */
export const shopProfileRouter = Router();
shopProfileRouter.use(requireAuth);

const MAX_ITEMS = 60;

async function myShop(userId: string) {
  const [shop] = await db.select().from(shops).where(eq(shops.ownerId, userId)).limit(1);
  if (!shop) throw new HttpError(404, "You don't have a shop yet");
  if (shop.status !== "approved") throw new HttpError(400, "You can build your work profile once your shop is approved");
  return shop;
}

const words = (max: number, label: string) =>
  z
    .array(z.string().trim().min(1).max(40, `Keep each ${label} under 40 characters`))
    .max(max, `Up to ${max} ${label}s`)
    .default([])
    .transform((list) => [...new Set(list.map((w) => w.replace(/\s+/g, " ")))]);

const videoUrl = z
  .string()
  .trim()
  .url("Paste the full link (https://…)")
  .refine(isVideoLink, "Use a YouTube, TikTok, Instagram, Facebook or Vimeo link");

const profileSchema = z
  .object({
    tagline: optionalText(80, "Tagline"),
    about: optionalText(2000, "About"),
    yearsExperience: z.number().int().min(0).max(80).nullable().default(null),
    skills: words(20, "skill"),
    certifications: words(10, "certification"),
    languages: words(8, "language"),
    serviceAreas: words(20, "area"),
    servesAt: z.array(z.enum(["home", "shop"])).max(2).default([]),
    videos: z
      .array(z.object({ url: videoUrl, title: optionalText(80, "Video title") }))
      .max(12, "Up to 12 videos")
      .default([]),
  })
  .strict();

shopProfileRouter.get("/work-profile", async (req, res) => {
  const shop = await myShop(req.user!.id);
  const items = await db.select().from(portfolioItems).where(eq(portfolioItems.shopId, shop.id)).orderBy(asc(portfolioItems.sortOrder), desc(portfolioItems.createdAt));
  res.json({ profile: { ...EMPTY_WORK_PROFILE, ...(shop.workProfile ?? {}) }, items: items.map(portfolioOut) });
});

shopProfileRouter.put("/work-profile", async (req, res) => {
  const shop = await myShop(req.user!.id);
  const input = parse(profileSchema, req.body) as WorkProfile;
  const [saved] = await db.update(shops).set({ workProfile: input, updatedAt: new Date() }).where(eq(shops.id, shop.id)).returning();
  res.json({ profile: { ...EMPTY_WORK_PROFILE, ...saved.workProfile } });
});

const itemSchema = z
  .object({
    title: requiredText(2, 80, "Title"),
    description: optionalText(600, "Description"),
    images: z.array(imageUrl).max(10, "Up to 10 photos per piece of work").default([]),
    videoUrl: videoUrl.nullish().transform((v) => v ?? null),
  })
  .strict();

const needsMedia = (v: { images?: string[]; videoUrl?: string | null }) => (v.images?.length ?? 0) > 0 || !!v.videoUrl;

shopProfileRouter.post("/portfolio", async (req, res) => {
  const shop = await myShop(req.user!.id);
  const input = parse(itemSchema, req.body);
  if (!needsMedia(input)) throw new HttpError(400, "Add at least one photo or a video link", { images: "Add a photo or a video" });
  const [{ n }] = await db.select({ n: count() }).from(portfolioItems).where(eq(portfolioItems.shopId, shop.id));
  if (n >= MAX_ITEMS) throw new HttpError(400, `You can show up to ${MAX_ITEMS} pieces of work — remove an old one first`);
  // New work goes to the top.
  const [first] = await db.select({ o: portfolioItems.sortOrder }).from(portfolioItems).where(eq(portfolioItems.shopId, shop.id)).orderBy(asc(portfolioItems.sortOrder)).limit(1);
  const [item] = await db
    .insert(portfolioItems)
    .values({ ...input, shopId: shop.id, sortOrder: (first?.o ?? 1) - 1 })
    .returning();
  res.status(201).json({ item: portfolioOut(item) });
});

async function ownItem(shopId: string, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Not found");
  const [item] = await db.select().from(portfolioItems).where(and(eq(portfolioItems.id, id), eq(portfolioItems.shopId, shopId))).limit(1);
  if (!item) throw new HttpError(404, "Not found");
  return item;
}

shopProfileRouter.patch("/portfolio/:id", async (req, res) => {
  const shop = await myShop(req.user!.id);
  const item = await ownItem(shop.id, String(req.params.id));
  const input = parse(itemSchema.partial(), req.body);
  if (!needsMedia({ images: input.images ?? item.images, videoUrl: input.videoUrl !== undefined ? input.videoUrl : item.videoUrl })) {
    throw new HttpError(400, "Keep at least one photo or a video link", { images: "Add a photo or a video" });
  }
  const [saved] = await db.update(portfolioItems).set({ ...input, updatedAt: new Date() }).where(eq(portfolioItems.id, item.id)).returning();
  res.json({ item: portfolioOut(saved) });
});

shopProfileRouter.delete("/portfolio/:id", async (req, res) => {
  const shop = await myShop(req.user!.id);
  const item = await ownItem(shop.id, String(req.params.id));
  await db.delete(portfolioItems).where(eq(portfolioItems.id, item.id));
  res.status(204).end();
});

/** Moves one piece of work up or down (renumbers them all, so the order is always clean). */
shopProfileRouter.post("/portfolio/:id/move", async (req, res) => {
  const shop = await myShop(req.user!.id);
  const { direction } = parse(z.object({ direction: z.enum(["up", "down"]) }), req.body);
  await ownItem(shop.id, String(req.params.id));
  const items = await db.transaction(async (tx) => {
    const list = await tx.select().from(portfolioItems).where(eq(portfolioItems.shopId, shop.id)).orderBy(asc(portfolioItems.sortOrder), desc(portfolioItems.createdAt));
    const i = list.findIndex((x) => x.id === req.params.id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
    for (const [k, x] of list.entries()) if (x.sortOrder !== k) await tx.update(portfolioItems).set({ sortOrder: k }).where(eq(portfolioItems.id, x.id));
    return list.map((x, k) => ({ ...x, sortOrder: k }));
  });
  res.json({ items: items.map(portfolioOut) });
});
