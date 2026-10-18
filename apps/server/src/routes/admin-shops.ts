import { Router, type Request } from "express";
import { z } from "zod";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import { shops, users, type ShopRow, type UserRow } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { shopDocuments, shopOut } from "../lib/serialize";
import { notify } from "../lib/notify";
import { COUNTRY_CODES, countryName, type AdminShop } from "@yanabuy/shared";

/** Shops and restaurants: the review queue, approvals, suspensions. Mounted under /api/admin. */
export const adminShopsRouter = Router();

const PAGE_SIZE = 25;
const reviewer = alias(users, "reviewer");

function adminShop(req: Request, s: ShopRow, owner: UserRow, withDocs: boolean, reviewedBy?: { id: string; fullName: string } | null): AdminShop {
  return {
    ...shopOut(s),
    owner: {
      id: owner.id,
      fullName: owner.fullName,
      phone: owner.phone,
      avatarUrl: owner.avatarUrl,
      status: owner.status,
      createdAt: owner.createdAt.toISOString(),
      unclaimed: owner.unclaimed,
    },
    ...(withDocs ? { documents: shopDocuments(req, s), reviewedBy: reviewedBy ?? null } : {}),
  };
}

const listSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "suspended"]).optional(),
  kind: z.enum(["store", "restaurant"]).optional(),
  q: z.string().trim().max(80).optional(),
  country: z.enum(COUNTRY_CODES).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

adminShopsRouter.get("/shops", async (req, res) => {
  const { status, kind, q, country, page } = parse(listSchema, req.query);
  const filters: SQL[] = [];
  if (country) filters.push(eq(shops.country, country));
  if (status) filters.push(eq(shops.status, status));
  if (kind) filters.push(eq(shops.kind, kind));
  if (q) {
    const like = `%${q}%`;
    const digits = q.replace(/\D/g, "").replace(/^0/, "");
    filters.push(
      or(
        ilike(shops.name, like),
        ilike(shops.city, like),
        ilike(users.fullName, like),
        ...(digits ? [ilike(shops.phone, `%${digits}%`), ilike(users.phone, `%${digits}%`)] : [])
      )!
    );
  }
  const where = filters.length ? and(...filters) : undefined;
  // Waiting shops: oldest first (fair queue). Everything else: newest first.
  const order = status === "pending" ? shops.submittedAt : desc(shops.submittedAt);

  const [rows, [total]] = await Promise.all([
    db
      .select({ shop: shops, owner: users })
      .from(shops)
      .innerJoin(users, eq(users.id, shops.ownerId))
      .where(where)
      .orderBy(order)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(shops).innerJoin(users, eq(users.id, shops.ownerId)).where(where),
  ]);
  res.json({ items: rows.map((r) => adminShop(req, r.shop, r.owner, false)), total: total.n, page, pageSize: PAGE_SIZE });
});

async function loadShop(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Shop not found");
  const [row] = await db
    .select({ shop: shops, owner: users, reviewer: { id: reviewer.id, fullName: reviewer.fullName } })
    .from(shops)
    .innerJoin(users, eq(users.id, shops.ownerId))
    .leftJoin(reviewer, eq(reviewer.id, shops.reviewedById))
    .where(eq(shops.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, "Shop not found");
  return row;
}

adminShopsRouter.get("/shops/:id", async (req, res) => {
  const row = await loadShop(req.params.id);
  res.json({ shop: adminShop(req, row.shop, row.owner, true, row.reviewer?.id ? row.reviewer : null) });
});

const reasonSchema = z.object({
  reason: z.string().trim().min(3, "Write a short reason — the owner will see it").max(300, "Keep the reason short"),
});

async function setStatus(
  req: Request,
  from: ShopRow["status"][],
  to: ShopRow["status"],
  action: string,
  reason: string | null
) {
  const row = await loadShop(req.params.id as string);
  if (!from.includes(row.shop.status)) {
    throw new HttpError(400, `This shop is ${row.shop.status} — that can't be done now. Reload to see the latest.`);
  }
  const [shop] = await db
    .update(shops)
    .set({ status: to, statusReason: reason, reviewedAt: new Date(), reviewedById: req.user!.id, updatedAt: new Date() })
    .where(eq(shops.id, row.shop.id))
    .returning();

  // An approved shop makes its owner a seller.
  let owner = row.owner;
  if (to === "approved" && owner.role === "buyer") {
    [owner] = await db.update(users).set({ role: "vendor", updatedAt: new Date() }).where(eq(users.id, owner.id)).returning();
  }
  await audit(req.user!.id, action, { type: "shop", id: shop.id }, { name: shop.name, owner: owner.fullName, ...(reason ? { reason } : {}) });
  notify([owner.id], {
    type: "shop",
    title:
      to === "approved"
        ? from.includes("suspended")
          ? `${shop.name} is open again`
          : `${shop.name} is approved — you can start selling`
        : to === "rejected"
          ? `YanaBuy asked for changes to ${shop.name}`
          : `${shop.name} is suspended`,
    body: reason,
    link: "/sell",
  });
  return adminShop(req, shop, owner, true, { id: req.user!.id, fullName: req.user!.fullName });
}

adminShopsRouter.post("/shops/:id/approve", async (req, res) => {
  res.json({ shop: await setStatus(req, ["pending"], "approved", "shop.approve", null) });
});

adminShopsRouter.post("/shops/:id/reject", async (req, res) => {
  const { reason } = parse(reasonSchema, req.body);
  res.json({ shop: await setStatus(req, ["pending"], "rejected", "shop.reject", reason) });
});

adminShopsRouter.post("/shops/:id/suspend", async (req, res) => {
  const { reason } = parse(reasonSchema, req.body);
  res.json({ shop: await setStatus(req, ["approved"], "suspended", "shop.suspend", reason) });
});

adminShopsRouter.post("/shops/:id/reinstate", async (req, res) => {
  res.json({ shop: await setStatus(req, ["suspended"], "approved", "shop.reinstate", null) });
});

/** Move a shop to another country (it then shows only to shoppers in that country). */
adminShopsRouter.post("/shops/:id/country", async (req, res) => {
  const { country } = parse(z.object({ country: z.enum(COUNTRY_CODES, { errorMap: () => ({ message: "Choose a country" }) }) }), req.body);
  const row = await loadShop(req.params.id as string);
  const [shop] = await db.update(shops).set({ country, updatedAt: new Date() }).where(eq(shops.id, row.shop.id)).returning();
  if (row.shop.country !== country) {
    await audit(req.user!.id, "shop.country", { type: "shop", id: shop.id }, { name: shop.name, from: row.shop.country, to: country });
    notify([row.owner.id], { type: "shop", title: `${shop.name} now sells in ${countryName(country)}`, body: `Shoppers in ${countryName(country)} can find your shop.`, link: "/sell" });
  }
  res.json({ shop: adminShop(req, shop, row.owner, true, row.reviewer?.id ? row.reviewer : null) });
});
