import { Router } from "express";
import { z } from "zod";
import { and, count, desc, eq, gt, gte, ilike, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { auditLogs, banners, categories, disputes, riderApplications, orders, payouts, products, shops, sourcingRequests, users } from "../db/schema";
import { adminShopsRouter } from "./admin-shops";
import { adminCatalogRouter } from "./admin-catalog";
import { adminProductsRouter } from "./admin-products";
import { adminOrdersRouter, orderStats } from "./admin-orders";
import { adminMoneyRouter } from "./admin-money";
import { adminTrustRouter } from "./admin-trust";
import { adminSourcingRouter } from "./admin-sourcing";
import { adminRidersRouter } from "./admin-riders";
import { adminShopifyRouter } from "./admin-shopify";
import { adminDiscountsRouter } from "./admin-discounts";
import { adminBookingsRouter } from "./bookings";
import { HttpError, parse } from "../lib/http";
import { adminUser, shopOut } from "../lib/serialize";
import { audit } from "../lib/audit";
import { endAllSessions } from "../lib/tokens";
import { requireAuth, requireRole } from "../middleware/auth";
import { adminBroadcastsRouter } from "./admin-broadcasts";
import type { ProductStatus, ShopStatus, UserRole } from "@yanabuy/shared";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin"));
adminRouter.use(adminShopsRouter);
adminRouter.use(adminCatalogRouter);
adminRouter.use(adminProductsRouter);
adminRouter.use(adminOrdersRouter);
adminRouter.use(adminMoneyRouter);
adminRouter.use(adminTrustRouter);
adminRouter.use(adminSourcingRouter);
adminRouter.use(adminRidersRouter);
adminRouter.use(adminShopifyRouter);
adminRouter.use(adminDiscountsRouter);
adminRouter.use(adminBookingsRouter);
adminRouter.use(adminBroadcastsRouter);

adminRouter.get("/stats", async (_req, res) => {
  const byRole = await db.select({ role: users.role, n: count() }).from(users).groupBy(users.role);
  const [blocked] = await db.select({ n: count() }).from(users).where(eq(users.status, "blocked"));
  const [recent] = await db
    .select({ n: count() })
    .from(users)
    .where(gte(users.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));

  const byShop = await db.select({ status: shops.status, n: count() }).from(shops).groupBy(shops.status);
  const [cats] = await db.select({ n: count() }).from(categories);
  const byProduct = await db.select({ status: products.status, n: count() }).from(products).groupBy(products.status);
  const now = new Date();
  const [live] = await db
    .select({ n: count() })
    .from(banners)
    .where(
      and(
        eq(banners.active, true),
        or(isNull(banners.startsAt), lte(banners.startsAt, now)),
        or(isNull(banners.endsAt), gt(banners.endsAt, now))
      )
    );

  const counts: Record<UserRole, number> = { buyer: 0, vendor: 0, rider: 0, admin: 0 };
  for (const row of byRole) counts[row.role] = row.n;
  const shopCounts: Record<ShopStatus, number> = { pending: 0, approved: 0, rejected: 0, suspended: 0 };
  for (const row of byShop) shopCounts[row.status] = row.n;
  const productCounts: Record<ProductStatus, number> = { pending: 0, approved: 0, rejected: 0, removed: 0 };
  for (const row of byProduct) productCounts[row.status] = row.n;
  const [waitingPayouts] = await db.select({ n: count() }).from(payouts).where(eq(payouts.status, "requested"));
  const [openDisputes] = await db.select({ n: count() }).from(disputes).where(eq(disputes.status, "open"));
  const [sourcingWaiting] = await db
    .select({ n: count() })
    .from(sourcingRequests)
    .where(or(eq(sourcingRequests.status, "pending"), eq(sourcingRequests.status, "accepted")));
  const [ridersPending] = await db.select({ n: count() }).from(riderApplications).where(eq(riderApplications.status, "pending"));
  res.json({ ridersPending: ridersPending.n, disputesOpen: openDisputes.n, sourcingWaiting: sourcingWaiting.n, payoutsWaiting: waitingPayouts.n, users: counts, blocked: blocked.n, newThisWeek: recent.n, shops: shopCounts, products: productCounts, orders: await orderStats(), categories: cats.n, liveBanners: live.n });
});

const PAGE_SIZE = 25;

const listSchema = z.object({
  role: z.enum(["buyer", "vendor", "rider", "admin"]).optional(),
  status: z.enum(["active", "blocked"]).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

adminRouter.get("/users", async (req, res) => {
  const { role, status, q, page } = parse(listSchema, req.query);
  const filters: SQL[] = [];
  if (role) filters.push(eq(users.role, role));
  if (status) filters.push(eq(users.status, status));
  if (q) {
    const digits = q.replace(/\D/g, "").replace(/^0/, "");
    const like = `%${q}%`;
    filters.push(
      or(ilike(users.fullName, like), ilike(users.email, like), ...(digits ? [ilike(users.phone, `%${digits}%`)] : []))!
    );
  }
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(users).where(where),
  ]);

  res.json({ items: rows.map(adminUser), total: total.n, page, pageSize: PAGE_SIZE });
});

async function getUserOr404(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "User not found");
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) throw new HttpError(404, "User not found");
  return user;
}

adminRouter.get("/users/:id", async (req, res) => {
  const user = await getUserOr404(req.params.id);
  const [shop] = await db.select().from(shops).where(eq(shops.ownerId, user.id)).limit(1);
  const [bought] = await db.select({ n: count() }).from(orders).where(eq(orders.buyerId, user.id));
  res.json({ user: adminUser(user), shop: shop ? shopOut(shop) : null, stats: { orders: bought.n } });
});

async function assertNotLastAdmin(userId: string) {
  const [admins] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.status, "active")));
  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (target?.role === "admin" && admins.n <= 1) {
    throw new HttpError(400, "There must always be at least one active admin");
  }
}

const roleSchema = z.object({ role: z.enum(["buyer", "vendor", "rider", "admin"]) });

adminRouter.patch("/users/:id/role", async (req, res) => {
  const { role } = parse(roleSchema, req.body);
  const user = await getUserOr404(req.params.id);
  if (user.id === req.user!.id) throw new HttpError(400, "You can't change your own role");
  if (user.role === role) return res.json({ user: adminUser(user) });
  if (user.role === "admin") await assertNotLastAdmin(user.id);

  const [updated] = await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, user.id)).returning();
  // Their next login carries the new role; old sessions are ended.
  await endAllSessions(user.id);
  await audit(req.user!.id, "user.role_change", { type: "user", id: user.id }, { from: user.role, to: role, name: user.fullName });
  res.json({ user: adminUser(updated) });
});

const blockSchema = z.object({
  reason: z.string().trim().min(3, "Write a short reason — the person will see it").max(300, "Keep the reason short"),
});

adminRouter.post("/users/:id/block", async (req, res) => {
  const { reason } = parse(blockSchema, req.body);
  const user = await getUserOr404(req.params.id);
  if (user.id === req.user!.id) throw new HttpError(400, "You can't block yourself");
  if (user.role === "admin") await assertNotLastAdmin(user.id);

  const [updated] = await db
    .update(users)
    .set({ status: "blocked", blockedReason: reason, blockedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();
  await endAllSessions(user.id);
  await audit(req.user!.id, "user.block", { type: "user", id: user.id }, { reason, name: user.fullName });
  res.json({ user: adminUser(updated) });
});

adminRouter.post("/users/:id/unblock", async (req, res) => {
  const user = await getUserOr404(req.params.id);
  const [updated] = await db
    .update(users)
    .set({ status: "active", blockedReason: null, blockedAt: null, updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();
  await audit(req.user!.id, "user.unblock", { type: "user", id: user.id }, { name: user.fullName });
  res.json({ user: adminUser(updated) });
});

adminRouter.get("/audit-log", async (req, res) => {
  const { page } = parse(z.object({ page: z.coerce.number().int().min(1).default(1) }), req.query);
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      details: auditLogs.details,
      createdAt: auditLogs.createdAt,
      adminId: users.id,
      adminName: users.fullName,
    })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.adminId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(50)
    .offset((page - 1) * 50);
  const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLogs);
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
      admin: { id: r.adminId, fullName: r.adminName },
    })),
    total: total.n,
    page,
    pageSize: 50,
  });
});
