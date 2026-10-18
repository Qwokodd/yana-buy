import { Router } from "express";
import { z } from "zod";
import { and, eq, like, ne } from "drizzle-orm";
import { db } from "../db/client";
import { categories, riderApplications, shops, type ShopRow } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { shopDocuments, shopOut } from "../lib/serialize";
import { slugify } from "../lib/slug";
import { imageUrl, optionalText, phone, privateKey, requiredText } from "../lib/validation";
import { requireAuth, requireEmail } from "../middleware/auth";
import type { Request } from "express";
import { COUNTRY_CODES, type MyShop } from "@yanabuy/shared";
import { notifyAdmins } from "../lib/notify";

export const shopRouter = Router();
shopRouter.use(requireAuth);

const profileFields = {
  name: requiredText(2, 60, "Shop name"),
  description: optionalText(500, "Description"),
  phone,
  city: requiredText(2, 60, "City"),
  address: requiredText(3, 160, "Address"),
  logoUrl: imageUrl.nullish().transform((v) => v ?? null),
  coverUrl: imageUrl.nullish().transform((v) => v ?? null),
  categoryId: z.string().uuid("Choose what kind of shop it is").nullish().transform((v) => v ?? null),
  hours: optionalText(120, "Opening hours"),
};

/** The shop's category must be one of the visible categories for its side (Goods for shops, Food for restaurants). */
async function checkShopCategory(categoryId: string | null | undefined, kind: "store" | "restaurant") {
  if (!categoryId) return;
  const [cat] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!cat || !cat.visible || cat.kind !== (kind === "restaurant" ? "food" : "goods")) {
    throw new HttpError(400, "Choose what kind of shop it is from the list", { categoryId: "Choose from the list" });
  }
}

const applicationSchema = z
  .object({
    kind: z.enum(["store", "restaurant"], { errorMap: () => ({ message: "Choose shop or restaurant" }) }),
    country: z.enum(COUNTRY_CODES, { errorMap: () => ({ message: "Choose the country you sell in" }) }).default("LR"),
    ...profileFields,
    idType: z.enum(["national_id", "passport", "drivers_license", "voter_card"], {
      errorMap: () => ({ message: "Choose the type of ID" }),
    }),
    idFrontKey: privateKey("a photo of the front of your ID"),
    idBackKey: z
      .string()
      .nullish()
      .transform((v) => v || null),
    selfieKey: privateKey("a selfie"),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.idType !== "passport" && !v.idBackKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["idBackKey"], message: "Upload a photo of the back of your ID" });
    }
    if (v.idBackKey && !privateKey("").safeParse(v.idBackKey).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["idBackKey"], message: "Upload the back of your ID again" });
    }
  });

const profileSchema = z.object(profileFields).partial().strict();

async function myShop(userId: string) {
  const [shop] = await db.select().from(shops).where(eq(shops.ownerId, userId)).limit(1);
  return shop ?? null;
}

/** A web address name nobody else has: "kebbehs-kitchen", "kebbehs-kitchen-2", … */
async function uniqueSlug(name: string, exceptId?: string) {
  const base = slugify(name);
  const taken = await db
    .select({ slug: shops.slug })
    .from(shops)
    .where(and(like(shops.slug, `${base}%`), exceptId ? ne(shops.id, exceptId) : undefined));
  const used = new Set(taken.map((t) => t.slug));
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

const mine = (req: Request, shop: ShopRow): MyShop => ({
  ...shopOut(shop),
  documents: { ...shopDocuments(req, shop), idFrontKey: shop.idFrontKey, idBackKey: shop.idBackKey, selfieKey: shop.selfieKey },
});

shopRouter.get("/mine", async (req, res) => {
  const shop = await myShop(req.user!.id);
  res.json({ shop: shop ? mine(req, shop) : null });
});

/** Send (or re-send after changes were asked for) a shop or restaurant for review. */
shopRouter.post("/apply", requireEmail, async (req, res) => {
  const user = req.user!;
  if (user.role === "rider" || user.role === "admin") {
    throw new HttpError(403, "Rider and admin accounts can't open a shop. Use a separate account for selling.");
  }
  const [riderApp] = await db
    .select({ status: riderApplications.status })
    .from(riderApplications)
    .where(eq(riderApplications.userId, user.id))
    .limit(1);
  if (riderApp && riderApp.status !== "rejected") {
    throw new HttpError(403, "This account has a rider application. Use a separate account for selling.");
  }
  const input = parse(applicationSchema, req.body);
  await checkShopCategory(input.categoryId, input.kind);
  const existing = await myShop(user.id);

  if (existing?.status === "approved") {
    throw new HttpError(400, "Your shop is already approved. Change its details from your shop settings.");
  }
  if (existing?.status === "suspended") {
    throw new HttpError(403, `Your shop is suspended${existing.statusReason ? `: ${existing.statusReason}` : ""}. Contact YanaBuy support.`);
  }

  const values = {
    ...input,
    slug: await uniqueSlug(input.name, existing?.id),
    status: "pending" as const,
    statusReason: null,
    submittedAt: new Date(),
    reviewedAt: null,
    reviewedById: null,
    updatedAt: new Date(),
  };

  const [shop] = existing
    ? await db.update(shops).set(values).where(eq(shops.id, existing.id)).returning()
    : await db.insert(shops).values({ ...values, ownerId: user.id }).returning();

  notifyAdmins({ title: `New ${shop.kind === "restaurant" ? "restaurant" : "shop"} to approve: ${shop.name}`, body: `${user.fullName} · ${shop.city}`, path: `/approvals?id=${shop.id}` });
  res.status(existing ? 200 : 201).json({ shop: mine(req, shop) });
});

/** Everyday edits once the shop is approved (name, logo, address…). ID documents can't change here. */
shopRouter.patch("/mine", async (req, res) => {
  const input = parse(profileSchema, req.body);
  const shop = await myShop(req.user!.id);
  if (!shop) throw new HttpError(404, "You don't have a shop yet");
  if (shop.status !== "approved") throw new HttpError(400, "You can edit your shop once it's approved");
  await checkShopCategory(input.categoryId, shop.kind);
  const slug = input.name && input.name !== shop.name ? await uniqueSlug(input.name, shop.id) : shop.slug;
  const [updated] = await db
    .update(shops)
    .set({ ...input, slug, updatedAt: new Date() })
    .where(eq(shops.id, shop.id))
    .returning();
  res.json({ shop: mine(req, updated) });
});
