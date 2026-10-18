import { Router, type Request } from "express";
import { z } from "zod";
import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { categories, products, shops, users, type ProductRow } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { notify } from "../lib/notify";
import { adminProduct, productColumns, reviewer } from "../lib/products";

/** Product review and take-downs. Mounted under /api/admin. */
export const adminProductsRouter = Router();

const PAGE_SIZE = 25;

const selectAdmin = () =>
  db
    .select({ ...productColumns, ownerName: users.fullName, reviewer: { id: reviewer.id, fullName: reviewer.fullName } })
    .from(products)
    .innerJoin(shops, eq(shops.id, products.shopId))
    .innerJoin(users, eq(users.id, shops.ownerId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(reviewer, eq(reviewer.id, products.reviewedById));

const listSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "removed"]).optional(),
  q: z.string().trim().max(80).optional(),
  shop: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

adminProductsRouter.get("/products", async (req, res) => {
  const { status, q, shop, page } = parse(listSchema, req.query);
  const filters: SQL[] = [];
  if (status) filters.push(eq(products.status, status));
  if (shop) filters.push(eq(products.shopId, shop));
  if (q) filters.push(or(ilike(products.name, `%${q}%`), ilike(shops.name, `%${q}%`), ilike(users.fullName, `%${q}%`))!);
  const where = filters.length ? and(...filters) : undefined;
  const order = status === "pending" ? asc(products.submittedAt) : desc(products.submittedAt);
  const [rows, [total]] = await Promise.all([
    selectAdmin().where(where).orderBy(order).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db
      .select({ n: count() })
      .from(products)
      .innerJoin(shops, eq(shops.id, products.shopId))
      .innerJoin(users, eq(users.id, shops.ownerId))
      .where(where),
  ]);
  res.json({ items: rows.map(adminProduct), total: total.n, page, pageSize: PAGE_SIZE });
});

async function load(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Product not found");
  const [row] = await selectAdmin().where(eq(products.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Product not found");
  return row;
}

adminProductsRouter.get("/products/:id", async (req, res) => {
  res.json({ product: adminProduct(await load(req.params.id)) });
});

const reasonSchema = z.object({
  reason: z.string().trim().min(3, "Write a short reason — the seller will see it").max(300, "Keep the reason short"),
});

async function setStatus(req: Request, from: ProductRow["status"][], to: ProductRow["status"], action: string, reason: string | null) {
  const row = await load(req.params.id as string);
  if (!from.includes(row.product.status)) {
    throw new HttpError(400, `This product is ${row.product.status} — that can't be done now. Reload to see the latest.`);
  }
  await db
    .update(products)
    .set({
      status: to,
      statusReason: reason,
      reviewedAt: new Date(),
      reviewedById: req.user!.id,
      ...(to !== "approved" ? { featured: false } : {}),
      updatedAt: new Date(),
    })
    .where(eq(products.id, row.product.id));
  await audit(req.user!.id, action, { type: "product", id: row.product.id }, { name: row.product.name, shop: row.shop.name, ...(reason ? { reason } : {}) });
  notify([row.shop.ownerId], {
    type: "product",
    title: to === "approved" ? `“${row.product.name}” is on sale` : to === "rejected" ? `YanaBuy asked you to fix “${row.product.name}”` : `“${row.product.name}” was taken down`,
    body: reason,
    link: "/sell/products",
  });
  return adminProduct(await load(row.product.id));
}

adminProductsRouter.post("/products/:id/approve", async (req, res) => {
  res.json({ product: await setStatus(req, ["pending"], "approved", "product.approve", null) });
});

adminProductsRouter.post("/products/:id/reject", async (req, res) => {
  const { reason } = parse(reasonSchema, req.body);
  res.json({ product: await setStatus(req, ["pending"], "rejected", "product.reject", reason) });
});

adminProductsRouter.post("/products/:id/remove", async (req, res) => {
  const { reason } = parse(reasonSchema, req.body);
  res.json({ product: await setStatus(req, ["pending", "approved", "rejected"], "removed", "product.remove", reason) });
});

adminProductsRouter.post("/products/:id/restore", async (req, res) => {
  res.json({ product: await setStatus(req, ["removed"], "approved", "product.restore", null) });
});

adminProductsRouter.post("/products/:id/feature", async (req, res) => {
  const { featured } = parse(z.object({ featured: z.boolean() }), req.body);
  const row = await load(req.params.id);
  if (featured && row.product.status !== "approved") throw new HttpError(400, "Only live products can be featured");
  await db.update(products).set({ featured, updatedAt: new Date() }).where(eq(products.id, row.product.id));
  await audit(req.user!.id, featured ? "product.feature" : "product.unfeature", { type: "product", id: row.product.id }, { name: row.product.name });
  res.json({ product: adminProduct(await load(row.product.id)) });
});
