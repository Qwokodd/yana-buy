import { Router } from "express";
import { z } from "zod";
import { and, count, desc, eq, ilike, isNotNull, max, min, or, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { products, shopifyContacts, shopifyOrders, shops, users } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { shopifyContactOut, shopifyOrderOut } from "../lib/shopify";
import { phone } from "../lib/validation";
import { endAllSessions } from "../lib/tokens";

/** The old Shopify store: order archive, contact list, and handing imported shops to their real owners. Mounted under /api/admin. */
export const adminShopifyRouter = Router();

const PAGE = 30;
const like = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

adminShopifyRouter.get("/shopify/summary", async (_req, res) => {
  const [[o], [c], [ca], [un], [is], [ho], [ip]] = await Promise.all([
    db.select({ n: count(), first: min(shopifyOrders.placedAt), last: max(shopifyOrders.placedAt) }).from(shopifyOrders),
    db.select({ n: count() }).from(shopifyContacts),
    db.select({ n: count() }).from(shopifyContacts).where(isNotNull(shopifyContacts.userId)),
    db.select({ n: count() }).from(users).where(and(eq(users.unclaimed, true), eq(users.role, "buyer"))),
    db.select({ n: count() }).from(shops).where(eq(shops.importedFrom, "shopify")),
    db
      .select({ n: count() })
      .from(shops)
      .innerJoin(users, eq(users.id, shops.ownerId))
      .where(and(eq(shops.importedFrom, "shopify"), eq(users.unclaimed, true))),
    db.select({ n: count() }).from(products).where(isNotNull(products.importedKey)),
  ]);
  res.json({
    summary: {
      orders: o.n,
      contacts: c.n,
      contactsWithAccount: ca.n,
      unclaimedAccounts: un.n,
      importedShops: is.n,
      shopsToHandOver: ho.n,
      importedProducts: ip.n,
      firstOrderAt: o.first?.toISOString() ?? null,
      lastOrderAt: o.last?.toISOString() ?? null,
    },
  });
});

const listQuery = z.object({ q: z.string().trim().max(80).optional(), page: z.coerce.number().int().min(1).default(1) });

adminShopifyRouter.get("/shopify/orders", async (req, res) => {
  const { q, page } = parse(listQuery, req.query);
  const where: SQL | undefined = q
    ? or(
        ilike(shopifyOrders.name, like(q)),
        ilike(shopifyOrders.buyerName, like(q)),
        ilike(shopifyOrders.phone, like(q.replace(/^0/, ""))),
        ilike(shopifyOrders.email, like(q)),
        ilike(shopifyOrders.vendors, like(q))
      )
    : undefined;
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(shopifyOrders).where(where).orderBy(desc(shopifyOrders.placedAt)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ n: count() }).from(shopifyOrders).where(where),
  ]);
  res.json({ items: rows.map(shopifyOrderOut), total: n, page, pageSize: PAGE });
});

const contactWhere = (q?: string): SQL | undefined =>
  q
    ? or(
        ilike(shopifyContacts.firstName, like(q)),
        ilike(shopifyContacts.lastName, like(q)),
        ilike(shopifyContacts.email, like(q)),
        ilike(shopifyContacts.phone, like(q.replace(/^0/, ""))),
        ilike(shopifyContacts.city, like(q))
      )
    : undefined;

adminShopifyRouter.get("/shopify/contacts", async (req, res) => {
  const { q, page } = parse(listQuery, req.query);
  const where = contactWhere(q);
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(shopifyContacts).where(where).orderBy(desc(shopifyContacts.totalSpent)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ n: count() }).from(shopifyContacts).where(where),
  ]);
  res.json({ items: rows.map(shopifyContactOut), total: n, page, pageSize: PAGE });
});

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Stop spreadsheet apps treating a cell as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The whole contact list as a spreadsheet file. Every download is in the audit log. */
adminShopifyRouter.get("/shopify/contacts.csv", async (req, res) => {
  const rows = await db.select().from(shopifyContacts).orderBy(desc(shopifyContacts.totalSpent));
  await audit(req.user!.id, "shopify.contacts_downloaded", { type: "shopify_contacts", id: "all" }, { count: rows.length });
  const head = ["First name", "Last name", "Email", "Phone", "City", "Address", "Total spent ($)", "Orders", "Email marketing OK", "SMS marketing OK", "Tags", "Has YanaBuy account"];
  const lines = rows.map((c) =>
    [c.firstName, c.lastName, c.email, c.phone, c.city, c.address, (c.totalSpent / 100).toFixed(2), c.totalOrders, c.acceptsEmail ? "yes" : "no", c.acceptsSms ? "yes" : "no", c.tags, c.userId ? "yes" : "no"]
      .map(csvCell)
      .join(",")
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="yanabuy-shopify-contacts.csv"`);
  res.send("﻿" + [head.join(","), ...lines].join("\r\n"));
});

/**
 * Gives an imported shop to its real owner. The owner signs up on YanaBuy first;
 * the admin types their phone number here. The placeholder account is switched off.
 */
adminShopifyRouter.post("/shops/:id/handover", async (req, res) => {
  const { phone: ownerPhone } = parse(z.object({ phone }), req.body);
  if (!z.string().uuid().safeParse(req.params.id).success) throw new HttpError(404, "Shop not found");
  const [shop] = await db.select().from(shops).where(eq(shops.id, req.params.id)).limit(1);
  if (!shop) throw new HttpError(404, "Shop not found");
  const [current] = await db.select().from(users).where(eq(users.id, shop.ownerId)).limit(1);
  if (!current?.unclaimed) throw new HttpError(409, "This shop already has a real owner. Only shops brought over from Shopify can be handed over.");

  const [next] = await db.select().from(users).where(eq(users.phone, ownerPhone)).limit(1);
  if (!next || next.unclaimed) {
    throw new HttpError(404, "Nobody has signed up with that number yet. Ask the shop owner to sign up on YanaBuy first, then try again.", { phone: "Not signed up yet" });
  }
  if (next.status === "blocked") throw new HttpError(409, "That account is blocked", { phone: "Blocked" });
  if (next.role === "admin" || next.role === "rider") throw new HttpError(409, `That number belongs to ${next.role === "admin" ? "an admin" : "a rider"} account`, { phone: "Wrong kind of account" });
  const [hasShop] = await db.select({ id: shops.id }).from(shops).where(eq(shops.ownerId, next.id)).limit(1);
  if (hasShop) throw new HttpError(409, "That person already has a shop. One account can own one shop.", { phone: "Already has a shop" });

  await db.transaction(async (tx) => {
    await tx.update(shops).set({ ownerId: next.id, phone: next.phone, updatedAt: new Date() }).where(eq(shops.id, shop.id));
    await tx.update(users).set({ role: "vendor", updatedAt: new Date() }).where(eq(users.id, next.id));
    await tx
      .update(users)
      .set({ status: "blocked", blockedReason: `Placeholder owner — shop handed over to ${next.fullName}`, blockedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, current.id));
  });
  await endAllSessions(current.id);
  await audit(req.user!.id, "shop.handed_over", { type: "shop", id: shop.id }, { to: next.id, toName: next.fullName, phone: next.phone });
  res.json({ ok: true, owner: { id: next.id, fullName: next.fullName, phone: next.phone } });
});
